import { formatOrigin } from '../shared/format';
import {
  SCOPULY_PROVIDER_ERROR,
  createProviderError,
  serializeProviderError
} from '../shared/provider-contract';
import { analyzeOrigin } from '../shared/security';
import { reviewTransactionXdr, verifySignedTransactionXdr } from '../shared/stellar-review';
import {
  normalizeX402Receipt,
  reviewAuthEntry,
  reviewMessage,
  verifySignedAuthEntry,
  verifySignedMessage
} from '../shared/provider-review';
import {
  getConnections,
  getDappPolicies,
  getPendingRequestRecord,
  getPendingRequests,
  getSettings,
  insertPendingRequestRecord,
  removePendingRequestRecord,
  savePendingRequestRecord,
  updatePendingRequestRecord
} from '../shared/storage';
import {
  NETWORKS,
  type MobileProviderRequest,
  type MobileProviderResult,
  type NetworkId,
  type PendingRequest,
  type ProviderMethod
} from '../shared/types';
import { SCOPULY_BRIDGE_LIMITS } from '../shared/bridge-protocol';
import {
  connectMobileOrigin,
  disconnectMobileSession,
  disconnectMobileOrigin,
  getMobileState,
  getOriginConnection,
  markMobileSessionHealthy,
  resolveConnectedMobileAccount,
  touchMobileOrigin
} from './mobile-state';
import { isBridgePrivateKeyUnavailableError } from './bridge-key-store';
import {
  BridgeTransportError,
  isRetryableBridgeError,
  mobileSignerTransport
} from './signer-transport';

const REQUEST_TTL_MS = 5 * 60 * 1000;
const MOBILE_STATUS_POLL_INTERVAL_MS = 2_500;
const MOBILE_STATUS_POLL_MAX_INTERVAL_MS = 10_000;
const SITE_ICON_MAX_DATA_URL_LENGTH = 66_000;
const MAX_ACTIVE_REQUESTS = 40;
const MAX_ACTIVE_SIGNING_REQUESTS_PER_ORIGIN = 5;
const requestQueues = new Map<string, Promise<void>>();
const requestRefreshes = new Map<string, Promise<PendingRequest | null>>();

export function mobileStatusPollDelay(attempt = 0) {
  const safeAttempt = Number.isSafeInteger(attempt) && attempt > 0 ? attempt : 0;
  return Math.min(
    MOBILE_STATUS_POLL_INTERVAL_MS * (2 ** Math.min(Math.max(0, safeAttempt - 1), 3)),
    MOBILE_STATUS_POLL_MAX_INTERVAL_MS
  );
}

async function inRequestQueue<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = requestQueues.get(id) || Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  requestQueues.set(id, tail);
  await previous;

  try {
    return await task();
  } finally {
    release();
    if (requestQueues.get(id) === tail) requestQueues.delete(id);
  }
}

function senderOrigin(sender: chrome.runtime.MessageSender) {
  const candidate = sender.origin || sender.url || sender.tab?.url || '';
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch (_error) {
    throw new Error('The dApp origin could not be verified by the browser.');
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Scopuly only accepts requests from web origins.');
  }
  return parsed.origin;
}

function sanitizeAppName(value: unknown, origin: string) {
  if (typeof value !== 'string') return formatOrigin(origin);
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  return sanitized || formatOrigin(origin);
}

function sanitizeIcon(value: unknown, origin: string) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (value.length <= SITE_ICON_MAX_DATA_URL_LENGTH
    && /^data:image\/(?:png|jpeg|webp|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return value;
  }
  try {
    const icon = new URL(value, origin);
    return icon.origin === origin && ['https:', 'http:'].includes(icon.protocol)
      ? icon.href
      : undefined;
  } catch (_error) {
    return undefined;
  }
}

function resolveNetworkPassphrase(value: unknown, fallbackNetworkId: NetworkId) {
  if (!value) return NETWORKS[fallbackNetworkId].passphrase;
  if (value === 'public' || value === 'stellar:pubnet' || value === NETWORKS.public.passphrase) {
    return NETWORKS.public.passphrase;
  }
  if (value === 'testnet' || value === 'stellar:testnet' || value === NETWORKS.testnet.passphrase) {
    return NETWORKS.testnet.passphrase;
  }
  throw new Error('Scopuly only supports Stellar Mainnet and Testnet.');
}

function networkIdFromPassphrase(passphrase: string): NetworkId {
  if (passphrase === NETWORKS.public.passphrase) return 'public';
  if (passphrase === NETWORKS.testnet.passphrase) return 'testnet';
  throw new Error('Unsupported Stellar network.');
}

async function openConfirmWindow(id: string) {
  const url = chrome.runtime.getURL(`confirm.html?requestId=${encodeURIComponent(id)}`);
  const created = await chrome.windows.create({
    url,
    type: 'popup',
    width: 430,
    height: 720,
    focused: true
  });
  if (typeof created.id !== 'number') throw new Error('Scopuly could not track the confirmation window.');
  return created.id;
}

async function openMobileSetupWindow(origin: string, appName: string) {
  const params = new URLSearchParams({
    setup: '1',
    origin,
    appName
  });
  const url = chrome.runtime.getURL(`popup.html?${params.toString()}`);
  await chrome.windows.create({
    url,
    type: 'popup',
    width: 430,
    height: 720,
    focused: true
  });
}

async function createPendingRequest(
  request: Omit<PendingRequest, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt'>,
  openWindow = true
) {
  const now = Date.now();
  const pending: PendingRequest = {
    ...request,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + REQUEST_TTL_MS
  };
  await insertPendingRequestRecord(pending, (requests) => {
    const active = requests.filter((item) => (
      item.status === 'awaitingApproval' || item.status === 'awaitingMobile'
    ));
    if (active.length >= MAX_ACTIVE_REQUESTS) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'Too many Scopuly requests are already pending. Finish or cancel one and try again.'
      );
    }
    const activeForOrigin = active.filter((item) => item.origin === request.origin);
    if (request.kind === 'connect' && activeForOrigin.some((item) => item.kind === 'connect')) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'A Scopuly connection request is already pending for this site.'
      );
    }
    if (request.kind !== 'connect'
      && activeForOrigin.filter((item) => item.kind !== 'connect').length
        >= MAX_ACTIVE_SIGNING_REQUESTS_PER_ORIGIN) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'Too many signing requests are already pending for this site.'
      );
    }
  });
  if (openWindow) {
    try {
      const confirmationWindowId = await openConfirmWindow(pending.id);
      await updatePendingRequestRecord(pending.id, (current) => ({
        ...current,
        confirmationWindowId
      }));
    } catch (error) {
      await removePendingRequestRecord(pending.id);
      throw error;
    }
  }
  return { pendingRequestId: pending.id, expiresAt: pending.expiresAt };
}

function completedProviderResult(request: PendingRequest, result: MobileProviderResult) {
  if (result.status !== 'completed' || !request.providerMethod) {
    throw new Error('Scopuly returned an incomplete provider result.');
  }
  if (result.method !== request.providerMethod) {
    throw new Error('Scopuly returned a result for a different provider method.');
  }

  if (result.method === 'reportX402Receipt') {
    if (!request.receipt || result.receiptId !== request.receipt.receiptId) {
      throw new Error('Scopuly returned a different x402 receipt.');
    }
    return {
      receiptId: result.receiptId,
      status: result.receiptStatus,
      transaction: result.transaction
    };
  }

  if (!request.publicKey || result.signerAddress !== request.publicKey) {
    throw new Error('Scopuly returned a different signer account.');
  }

  if (result.method === 'signMessage') {
    if (request.message === undefined) throw new Error('Stored message signing request is incomplete.');
    return verifySignedMessage(request.message, result.signedMessage, request.publicKey);
  }

  if (result.method === 'signAuthEntry') {
    if (!request.authEntry) throw new Error('Stored authorization request is incomplete.');
    return verifySignedAuthEntry(request.authEntry, result.signedAuthEntry, request.publicKey);
  }

  if (!request.xdr || !request.networkPassphrase) {
    throw new Error('Stored transaction signing request is incomplete.');
  }
  const verified = verifySignedTransactionXdr(
    request.xdr,
    result.signedTxXdr,
    request.networkPassphrase,
    request.publicKey
  );
  if (request.submit) {
    if (!result.submissionStatus || !result.hash) {
      throw new Error('Scopuly did not return the transaction submission result.');
    }
    if (result.hash !== verified.hash) {
      throw new Error('Scopuly returned a submission hash for a different transaction.');
    }
    return {
      ...verified,
      signedXDR: verified.signedTxXdr,
      status: result.submissionStatus,
      hash: result.hash
    };
  }
  return {
    ...verified,
    signedXDR: verified.signedTxXdr
  };
}

async function completeMobileProviderRequest(
  request: PendingRequest,
  result: MobileProviderResult
) {
  await inRequestQueue(request.id, async () => {
    const current = await getPendingRequestRecord(request.id);
    if (!current || current.status !== 'awaitingMobile') return;
    request = current;

    if (request.expiresAt <= Date.now()) {
      await savePendingRequestRecord({
        ...request,
        status: 'expired',
        error: 'Scopuly request expired.',
        errorCode: SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        updatedAt: Date.now()
      });
      return;
    }

    if (result.status === 'pending') {
      await savePendingRequestRecord({
        ...request,
        status: 'awaitingMobile',
        transportRequestId: result.transportRequestId,
        mobilePollAttempt: (request.mobilePollAttempt || 0) + 1,
        lastTransportError: undefined,
        mobilePushStatus: result.pushStatus || request.mobilePushStatus,
        updatedAt: Date.now()
      });
      return;
    }

    if (result.status === 'rejected') {
      await savePendingRequestRecord({
        ...request,
        status: 'rejected',
        transportRequestId: result.transportRequestId,
        mobileRequestEnvelope: undefined,
        error: result.error || 'Request rejected in Scopuly.',
        errorCode: SCOPULY_PROVIDER_ERROR.USER_REJECTED,
        updatedAt: Date.now()
      });
      return;
    }

    if (result.status === 'failed') {
      await savePendingRequestRecord({
        ...request,
        status: 'failed',
        transportRequestId: result.transportRequestId,
        mobileRequestEnvelope: undefined,
        error: result.error,
        errorCode: SCOPULY_PROVIDER_ERROR.EXTERNAL_SERVICE,
        updatedAt: Date.now()
      });
      return;
    }

    const verified = completedProviderResult(request, result);
    await savePendingRequestRecord({
      ...request,
      status: 'completed',
      transportRequestId: result.transportRequestId,
      mobileRequestEnvelope: undefined,
      lastTransportError: undefined,
      mobilePushStatus: undefined,
      result: verified,
      updatedAt: Date.now()
    });
  });
}

async function recordMobileTransportError(
  request: PendingRequest,
  error: unknown,
  sessionId?: string
) {
  const missingChannelKey = isBridgePrivateKeyUnavailableError(error);
  const terminalBridgeSession = error instanceof BridgeTransportError
    && [401, 404, 410].includes(error.status || 0);
  const message = missingChannelKey || terminalBridgeSession
    ? 'The secure signing session was lost. Pair Scopuly again.'
    : error instanceof Error ? error.message : String(error);
  if ((missingChannelKey || terminalBridgeSession) && sessionId) {
    await disconnectMobileSession(sessionId);
  }

  await inRequestQueue(request.id, async () => {
    await updatePendingRequestRecord(request.id, (current) => {
      if (current.status !== 'awaitingMobile') return current;
      if (isRetryableBridgeError(error) && current.expiresAt > Date.now()) {
        return {
          ...current,
          mobilePollAttempt: (current.mobilePollAttempt || 0) + 1,
          lastTransportError: message,
          updatedAt: Date.now()
        };
      }
      return {
        ...current,
        status: 'failed',
        error: message,
        errorCode: SCOPULY_PROVIDER_ERROR.EXTERNAL_SERVICE,
        updatedAt: Date.now()
      };
    });
  });
}

function mobileProviderRequest(
  request: PendingRequest,
  sessionId: string,
  accountId: string,
  publicKey: string
): MobileProviderRequest {
  const base = {
    requestId: request.id,
    sessionId,
    accountId,
    publicKey,
    origin: request.origin,
    appName: request.appName,
    expiresAt: request.expiresAt
  };

  if (request.providerMethod === 'signTransaction'
    || request.providerMethod === 'signAndSubmitTransaction') {
    if (!request.xdr || !request.networkPassphrase || !request.review?.ok || !request.review.hash) {
      throw new Error('Transaction signing request is incomplete.');
    }
    return {
      ...base,
      method: request.providerMethod,
      xdr: request.xdr,
      networkPassphrase: request.networkPassphrase,
      transactionHash: request.review.hash,
      submit: Boolean(request.submit)
    };
  }

  if (request.providerMethod === 'signMessage') {
    if (request.message === undefined || !request.messageHash || !request.networkPassphrase) {
      throw new Error('Message signing request is incomplete.');
    }
    return {
      ...base,
      method: 'signMessage',
      message: request.message,
      messageHash: request.messageHash,
      networkPassphrase: request.networkPassphrase
    };
  }

  if (request.providerMethod === 'signAuthEntry') {
    if (!request.authEntry
      || !request.authEntryFingerprint
      || !request.authEntryReview
      || !request.networkPassphrase) {
      throw new Error('Authorization signing request is incomplete.');
    }
    return {
      ...base,
      method: 'signAuthEntry',
      authEntry: request.authEntry,
      authEntryFingerprint: request.authEntryFingerprint,
      networkPassphrase: request.networkPassphrase,
      expirationLedger: request.authEntryReview.expirationLedger,
      boundAddress: request.authEntryReview.boundAddress
    };
  }

  if (request.providerMethod === 'reportX402Receipt' && request.receipt) {
    return {
      ...base,
      method: 'reportX402Receipt',
      receiptId: request.receipt.receiptId!,
      receiptUrl: request.receipt.receiptUrl!
    };
  }

  throw new Error('Unsupported stored Scopuly provider request.');
}

export async function sendPendingRequestToMobile(id: string) {
  let request = await getPendingRequest(id);
  if (!request || !request.providerMethod) throw new Error('Provider request not found.');
  if (!request.accountId || !request.publicKey) throw new Error('Provider request account is incomplete.');
  if (request.status === 'failed') {
    request = {
      ...request,
      status: 'awaitingMobile',
      error: undefined,
      errorCode: undefined,
      lastTransportError: undefined,
      mobilePushStatus: undefined,
      updatedAt: Date.now()
    };
    await savePendingRequestRecord(request);
  }
  if (request.status !== 'awaitingMobile') {
    throw new Error('Provider request is no longer awaiting Scopuly.');
  }

  const accountId = request.accountId;
  const publicKey = request.publicKey;
  const providerMethod = request.providerMethod;
  if (!providerMethod) throw new Error('Stored provider method is missing.');

  const state = await getMobileState();
  const account = state.mobileAccounts.find((item) => (
    item.id === accountId && item.publicKey === publicKey
  ));
  const session = account && state.mobileSessions.find((item) => item.id === account.sessionId);
  if (!account || !session) throw new Error('The selected Scopuly session is unavailable.');

  try {
    if (request.transportRequestId) {
      const result = await mobileSignerTransport.getProviderRequestStatus({
        transportRequestId: request.transportRequestId,
        sessionId: session.id,
        requestId: request.id,
        expectedMethod: providerMethod
      });
      await markMobileSessionHealthy(session.id);
      await completeMobileProviderRequest(request, result);
      return;
    }

    const mobileRequest = mobileProviderRequest(
      request,
      session.id,
      account.id,
      account.publicKey
    );
    const envelope = request.mobileRequestEnvelope
      || await mobileSignerTransport.prepareProviderRequest(mobileRequest);

    if (!request.mobileRequestEnvelope) {
      request = await updatePendingRequestRecord(request.id, (current) => ({
        ...current,
        mobileRequestEnvelope: envelope
      })) || request;
    }

    const result = await mobileSignerTransport.sendPreparedProviderRequest(
      mobileRequest,
      envelope
    );
    await markMobileSessionHealthy(session.id);
    await completeMobileProviderRequest(request, result);
  } catch (error) {
    await recordMobileTransportError(request, error, session.id);
  }
}

async function refreshPendingRequestOnce(id: string) {
  const request = await getPendingRequest(id);
  if (!request) return null;
  if (request.status !== 'awaitingMobile') return request;
  if (Date.now() - request.updatedAt < mobileStatusPollDelay(request.mobilePollAttempt)) {
    return request;
  }
  if (!request.providerMethod) throw new Error('Stored provider method is missing.');

  try {
    if (!request.transportRequestId) {
      await sendPendingRequestToMobile(request.id);
      return getPendingRequest(id);
    }
    const state = await getMobileState();
    const account = state.mobileAccounts.find((item) => (
      item.id === request.accountId && item.publicKey === request.publicKey
    ));
    const session = account && state.mobileSessions.find((item) => item.id === account.sessionId);
    if (!session) throw new Error('The selected Scopuly session is unavailable.');
    const result = await mobileSignerTransport.getProviderRequestStatus({
      transportRequestId: request.transportRequestId,
      sessionId: session.id,
      requestId: request.id,
      expectedMethod: request.providerMethod
    });
    await markMobileSessionHealthy(session.id);
    await completeMobileProviderRequest(request, result);
  } catch (error) {
    const state = await getMobileState();
    const account = state.mobileAccounts.find((item) => (
      item.id === request.accountId && item.publicKey === request.publicKey
    ));
    await recordMobileTransportError(request, error, account?.sessionId);
  }
  return getPendingRequest(id);
}

export function refreshPendingRequest(id: string) {
  const active = requestRefreshes.get(id);
  if (active) return active;
  const refresh = refreshPendingRequestOnce(id).finally(() => {
    if (requestRefreshes.get(id) === refresh) requestRefreshes.delete(id);
  });
  requestRefreshes.set(id, refresh);
  return refresh;
}

export async function getPendingRequest(id: string) {
  const request = await getPendingRequestRecord(id);
  if (!request) return null;
  if (request.expiresAt <= Date.now() && !['completed', 'rejected', 'failed'].includes(request.status)) {
    return updatePendingRequestRecord(id, (current) => {
      if (['completed', 'rejected', 'expired', 'failed'].includes(current.status)) return current;
      return {
        ...current,
        status: 'expired',
        error: 'Scopuly request expired.',
        errorCode: SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        updatedAt: Date.now()
      };
    });
  }
  return request;
}

export async function getProviderRequestStatus(id: string, sender: chrome.runtime.MessageSender) {
  const request = await refreshPendingRequest(id);
  if (!request) throw new Error('Scopuly request not found.');
  if (request.origin !== senderOrigin(sender)) throw new Error('Scopuly request origin mismatch.');

  if (request.status === 'completed') {
    if (request.providerMethod) {
      const [state, connection] = await Promise.all([
        getMobileState(),
        getOriginConnection(request.origin)
      ]);
      const account = resolveConnectedMobileAccount(connection, state.mobileAccounts);
      if (!account || account.id !== request.accountId || account.publicKey !== request.publicKey) {
        const rejected = await updatePendingRequestRecord(request.id, (current) => ({
          ...current,
          status: 'rejected',
          result: undefined,
          error: 'The dApp connection was closed before the result was delivered.',
          errorCode: SCOPULY_PROVIDER_ERROR.USER_REJECTED,
          updatedAt: Date.now()
        }));
        return {
          done: true,
          error: serializeProviderError({
            code: rejected?.errorCode || SCOPULY_PROVIDER_ERROR.USER_REJECTED,
            message: rejected?.error || 'The dApp connection was closed.'
          })
        };
      }
    }
    return { done: true, response: request.result };
  }
  if (['rejected', 'expired', 'failed'].includes(request.status)) {
    return {
      done: true,
      error: serializeProviderError(
        {
          code: request.errorCode || SCOPULY_PROVIDER_ERROR.INTERNAL,
          message: request.error || 'Scopuly request failed.'
        }
      )
    };
  }
  return { done: false, status: request.status };
}

export async function approvePendingRequest(id: string) {
  return inRequestQueue(id, async () => {
    const request = await getPendingRequest(id);
    if (!request) throw new Error('Pending request not found.');
    if (request.status !== 'awaitingApproval') throw new Error('This request is no longer awaiting approval.');
    if (request.kind !== 'connect') throw new Error('Transaction approval only happens in Scopuly.');

    const result = await connectMobileOrigin(
      request.origin,
      request.appName,
      request.icon,
      request.accountId
    );
    await savePendingRequestRecord({
      ...request,
      status: 'completed',
      confirmationWindowId: undefined,
      result,
      updatedAt: Date.now()
    });
    return result;
  });
}

export async function rejectPendingRequest(id: string, reason = 'User rejected request.') {
  await inRequestQueue(id, async () => {
    const request = await getPendingRequestRecord(id);
    if (!request || ['completed', 'rejected', 'expired'].includes(request.status)) return;
    await savePendingRequestRecord({
      ...request,
      status: 'rejected',
      error: reason,
      errorCode: SCOPULY_PROVIDER_ERROR.USER_REJECTED,
      updatedAt: Date.now()
    });
    if (request.providerMethod && request.transportRequestId) {
      const state = await getMobileState();
      const account = state.mobileAccounts.find((item) => (
        item.id === request.accountId && item.publicKey === request.publicKey
      ));
      const session = account && state.mobileSessions.find((item) => item.id === account.sessionId);
      if (session) {
        await mobileSignerTransport.cancelProviderRequest({
          transportRequestId: request.transportRequestId,
          sessionId: session.id,
          requestId: request.id,
          expiresAt: Date.now() + 60_000
        }).catch(() => undefined);
      }
    }
  });
}

export async function rejectPendingRequestsForOrigin(
  origin: string,
  reason = 'The dApp connection was closed.'
) {
  const requests = await getPendingRequests();
  const active = requests.filter((request) => (
    request.origin === origin
    && (request.status === 'awaitingApproval' || request.status === 'awaitingMobile')
  ));
  await Promise.all(active.map((request) => rejectPendingRequest(request.id, reason)));
}

export async function rejectPendingRequestsForSession(sessionId: string) {
  const state = await getMobileState();
  const accountIds = new Set(
    state.mobileAccounts
      .filter((account) => account.sessionId === sessionId)
      .map((account) => account.id)
  );
  if (!accountIds.size) return;
  const requests = await getPendingRequests();
  const active = requests.filter((request) => (
    Boolean(request.accountId && accountIds.has(request.accountId))
    && (request.status === 'awaitingApproval' || request.status === 'awaitingMobile')
  ));
  await Promise.all(active.map((request) => rejectPendingRequest(
    request.id,
    'The paired Scopuly session was disconnected.'
  )));
}

export async function rejectPendingConnectRequestForWindow(windowId: number) {
  const requests = await getPendingRequests();
  const request = requests.find((item) => (
    item.kind === 'connect'
    && item.status === 'awaitingApproval'
    && item.confirmationWindowId === windowId
  ));
  if (request) {
    await rejectPendingRequest(request.id, 'Connection request window was closed.');
  }
}

export async function consumePendingRequest(id: string, sender: chrome.runtime.MessageSender) {
  // Keep the terminal record until the normal retention sweep removes it. The
  // dApp receives an idempotent terminal result, while an already-open confirm
  // window can still render the same final state instead of flashing
  // "Request no longer active" immediately after a successful response.
  return getProviderRequestStatus(id, sender);
}

export async function dismissPendingRequest(id: string) {
  return inRequestQueue(id, async () => {
    const request = await getPendingRequestRecord(id);
    if (!request) return { ok: true };

    if (!['completed', 'rejected', 'expired', 'failed'].includes(request.status)) {
      throw new Error('An active Scopuly request cannot be dismissed. Cancel it first.');
    }

    await removePendingRequestRecord(id);
    return { ok: true };
  });
}

export async function getProviderSnapshot(sender: chrome.runtime.MessageSender) {
  const origin = senderOrigin(sender);
  const [state, settings, connection] = await Promise.all([
    getMobileState(),
    getSettings(),
    getOriginConnection(origin)
  ]);
  const connectedAccount = resolveConnectedMobileAccount(connection, state.mobileAccounts);
  const address = connectedAccount?.publicKey || '';

  return {
    address,
    isConnected: Boolean(address),
    network: settings.networkId === 'public' ? 'PUBLIC' : 'TESTNET',
    networkPassphrase: NETWORKS[settings.networkId].passphrase
  };
}

export async function handleProviderRequest(payload: any, sender: chrome.runtime.MessageSender) {
  const origin = senderOrigin(sender);
  const method = typeof payload?.method === 'string' ? payload.method : '';
  const appName = sanitizeAppName(payload?.appName, origin);
  const icon = sanitizeIcon(payload?.icon, origin);
  const state = await getMobileState();
  const [settings, connections, policies] = await Promise.all([
    getSettings(),
    getConnections(),
    getDappPolicies()
  ]);
  const originRisk = analyzeOrigin(origin, connections, policies);

  if (originRisk.policy === 'blocked') throw new Error('This dApp is blocked by your Scopuly policy.');
  if (settings.blockUnsecureOrigins && !originRisk.secure && !originRisk.local) {
    throw new Error('This dApp is not using HTTPS and is blocked by Scopuly.');
  }

  const connection = await getOriginConnection(origin);
  const connectedAccount = resolveConnectedMobileAccount(connection, state.mobileAccounts);

  if (method === 'isConnected') {
    return { isConnected: Boolean(connectedAccount) };
  }

  if (method === 'getNetwork') {
    return {
      network: settings.networkId === 'public' ? 'PUBLIC' : 'TESTNET',
      networkPassphrase: NETWORKS[settings.networkId].passphrase
    };
  }

  if (method === 'disconnect') {
    await rejectPendingRequestsForOrigin(origin);
    await disconnectMobileOrigin(origin);
    return {};
  }

  if (!state.mobileAccounts.length
    && ['requestAccess', 'getAddress', 'getPublicKey'].includes(method)) {
    await openMobileSetupWindow(origin, appName).catch(() => undefined);
    throw createProviderError(
      SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
      'First connect a Scopuly account in the extension window, then return here and try again.'
    );
  }

  if (!state.mobileAccounts.length) {
    throw createProviderError(
      SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
      'Connect Scopuly to the extension first.'
    );
  }

  if (['requestAccess', 'getAddress', 'getPublicKey'].includes(method)) {
    if (connectedAccount) {
      await touchMobileOrigin(origin);
      return {
        address: connectedAccount.publicKey,
        ...(method === 'getPublicKey' ? { publicKey: connectedAccount.publicKey } : {})
      };
    }
    return createPendingRequest({
      kind: 'connect',
      status: 'awaitingApproval',
      origin,
      appName,
      icon,
      accountId: state.selectedAccountId,
      publicKey: state.publicKey,
      originRisk
    });
  }

  if ([
    'signTransaction',
    'signAndSubmitTransaction',
    'signMessage',
    'signAuthEntry',
    'reportX402Receipt'
  ].includes(method)) {
    if (!connectedAccount) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'Reconnect this dApp to a Scopuly account.'
      );
    }
    await touchMobileOrigin(origin);
  }

  if (method === 'signTransaction' || method === 'signAndSubmitTransaction') {
    const opts = payload?.params?.opts && typeof payload.params.opts === 'object'
      ? payload.params.opts
      : payload?.params || {};
    const xdr = payload?.params?.xdr || payload?.params?.transactionXdr || payload?.params?.[0];
    if (typeof xdr !== 'string' || !xdr.trim()) throw new Error('Missing transaction XDR.');
    if (xdr.length > SCOPULY_BRIDGE_LIMITS.transactionXdrBytes) {
      throw new Error('Transaction XDR exceeds the Scopuly safety limit.');
    }
    if (opts.address && opts.address !== connectedAccount!.publicKey) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'The requested signer does not match the account connected to this dApp.'
      );
    }
    if (opts.submitUrl) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'Custom transaction submit URLs are not supported.'
      );
    }
    const requiredCapability = method === 'signAndSubmitTransaction' || opts.submit === true
      ? 'signAndSubmitTransaction'
      : 'signTransaction';
    const connectedSession = state.mobileSessions.find(
      (session) => session.id === connectedAccount!.sessionId
    );
    if (!connectedSession?.capabilities.includes(requiredCapability)) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        `The paired Scopuly app does not support ${requiredCapability}.`
      );
    }

    const passphrase = resolveNetworkPassphrase(
      opts.networkPassphrase || opts.network || payload?.params?.networkPassphrase,
      settings.networkId
    );
    const networkId = networkIdFromPassphrase(passphrase);
    if (!connectedAccount!.supportedNetworks.includes(networkId)) {
      throw new Error(`${connectedAccount!.name} does not support ${NETWORKS[networkId].label}.`);
    }

    const review = reviewTransactionXdr(xdr, passphrase);
    if (!review.ok) throw new Error(review.error || 'Invalid transaction XDR.');

    const pending = await createPendingRequest({
      kind: 'signXdr',
      status: 'awaitingMobile',
      providerMethod: method,
      origin,
      appName,
      icon,
      accountId: connectedAccount!.id,
      publicKey: connectedAccount!.publicKey,
      xdr,
      networkPassphrase: passphrase,
      submit: method === 'signAndSubmitTransaction' || opts.submit === true,
      review,
      originRisk
    });
    await sendPendingRequestToMobile(pending.pendingRequestId);
    return pending;
  }

  if (method === 'signMessage') {
    const opts = payload?.params?.opts && typeof payload.params.opts === 'object'
      ? payload.params.opts
      : payload?.params || {};
    if (opts.address && opts.address !== connectedAccount!.publicKey) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'The requested signer does not match the account connected to this dApp.'
      );
    }
    const connectedSession = state.mobileSessions.find(
      (session) => session.id === connectedAccount!.sessionId
    );
    if (!connectedSession?.capabilities.includes('signMessage')) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'The paired Scopuly app does not support signMessage.'
      );
    }
    const message = payload?.params?.message ?? payload?.params?.[0];
    const messageReview = reviewMessage(message);
    const passphrase = resolveNetworkPassphrase(
      opts.networkPassphrase || opts.network,
      settings.networkId
    );
    const networkId = networkIdFromPassphrase(passphrase);
    if (!connectedAccount!.supportedNetworks.includes(networkId)) {
      throw new Error(`${connectedAccount!.name} does not support ${NETWORKS[networkId].label}.`);
    }

    const pending = await createPendingRequest({
      kind: 'signMessage',
      status: 'awaitingMobile',
      providerMethod: 'signMessage',
      origin,
      appName,
      icon,
      accountId: connectedAccount!.id,
      publicKey: connectedAccount!.publicKey,
      message,
      messageHash: messageReview.hash,
      messageReview,
      networkPassphrase: passphrase,
      originRisk
    });
    await sendPendingRequestToMobile(pending.pendingRequestId);
    return pending;
  }

  if (method === 'signAuthEntry') {
    const opts = payload?.params?.opts && typeof payload.params.opts === 'object'
      ? payload.params.opts
      : payload?.params || {};
    if (opts.address && opts.address !== connectedAccount!.publicKey) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'The requested signer does not match the account connected to this dApp.'
      );
    }
    const connectedSession = state.mobileSessions.find(
      (session) => session.id === connectedAccount!.sessionId
    );
    if (!connectedSession?.capabilities.includes('signAuthEntry')) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'The paired Scopuly app does not support signAuthEntry.'
      );
    }
    const authEntry = payload?.params?.authEntry ?? payload?.params?.[0];
    const passphrase = resolveNetworkPassphrase(
      opts.networkPassphrase || opts.network,
      settings.networkId
    );
    const networkId = networkIdFromPassphrase(passphrase);
    if (!connectedAccount!.supportedNetworks.includes(networkId)) {
      throw new Error(`${connectedAccount!.name} does not support ${NETWORKS[networkId].label}.`);
    }
    const authEntryReview = reviewAuthEntry(
      authEntry,
      passphrase,
      connectedAccount!.publicKey
    );

    const pending = await createPendingRequest({
      kind: 'signAuthEntry',
      status: 'awaitingMobile',
      providerMethod: 'signAuthEntry',
      origin,
      appName,
      icon,
      accountId: connectedAccount!.id,
      publicKey: connectedAccount!.publicKey,
      authEntry,
      authEntryFingerprint: authEntryReview.fingerprint,
      authEntryReview,
      networkPassphrase: passphrase,
      originRisk
    });
    await sendPendingRequestToMobile(pending.pendingRequestId);
    return pending;
  }

  if (method === 'reportX402Receipt') {
    const connectedSession = state.mobileSessions.find(
      (session) => session.id === connectedAccount!.sessionId
    );
    if (!connectedSession?.capabilities.includes('reportX402Receipt')) {
      throw createProviderError(
        SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        'The paired Scopuly app does not support reportX402Receipt.'
      );
    }
    const receipt = normalizeX402Receipt(payload?.params || {});
    const pending = await createPendingRequest({
      kind: 'reportX402',
      status: 'awaitingMobile',
      providerMethod: 'reportX402Receipt',
      origin,
      appName,
      icon,
      accountId: connectedAccount!.id,
      publicKey: connectedAccount!.publicKey,
      receipt,
      originRisk
    }, false);
    await sendPendingRequestToMobile(pending.pendingRequestId);
    return pending;
  }

  throw createProviderError(
    SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
    `Unsupported Scopuly provider method: ${method || 'unknown'}`
  );
}
