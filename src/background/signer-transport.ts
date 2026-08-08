import type {
  MobilePairingStatusResult,
  MobilePushDeliveryStatus,
  MobileProviderRequest,
  MobileProviderResult,
  MobileSession,
  PairingRequest,
  ProviderMethod
} from '../shared/types';
import {
  parseEncryptedBridgeEnvelope,
  parseMobilePairingApproval,
  parseMobileProviderResult,
  parsePairingRelayStatus,
  parsePairingRequest
} from '../shared/bridge-validation';
import {
  SCOPULY_BRIDGE_CAPABILITIES,
  SCOPULY_BRIDGE_PROTOCOL_VERSION
} from '../shared/bridge-protocol';
import {
  decryptBridgePayload,
  deriveBridgeEncryptionKey,
  encryptBridgePayload,
  generateBridgeKeyPair,
  verifyPairingProof
} from '../shared/bridge-crypto';
import {
  getMobileSessions,
  mutateMobileSessions
} from '../shared/storage';
import {
  deleteBridgePrivateKey,
  getBridgePrivateKey,
  saveBridgePrivateKey,
  updateBridgePrivateKeyExpiration
} from './bridge-key-store';

type ProviderStatusContext = {
  transportRequestId: string;
  sessionId: string;
  requestId: string;
  expectedMethod: ProviderMethod;
};

type ProviderCancelContext = {
  transportRequestId: string;
  sessionId: string;
  requestId: string;
  expiresAt: number;
};

export interface MobileSignerTransport {
  readonly id: 'scopuly-bridge' | 'walletconnect';
  isConfigured(): boolean;
  createPairing(): Promise<PairingRequest>;
  getPairingStatus(pairing: PairingRequest): Promise<MobilePairingStatusResult>;
  cancelPairing(pairing: PairingRequest): Promise<void>;
  sendProviderRequest(request: MobileProviderRequest): Promise<MobileProviderResult>;
  getProviderRequestStatus(context: ProviderStatusContext): Promise<MobileProviderResult>;
  cancelProviderRequest(context: ProviderCancelContext): Promise<void>;
  getSessionHealth(session: MobileSession): Promise<number>;
  disconnect(session: MobileSession): Promise<void>;
}

type JsonObject = Record<string, unknown>;
const sessionQueues = new Map<string, Promise<void>>();
const BRIDGE_REQUEST_TIMEOUT_MS = 45_000;
const PUSH_DELIVERY_STATUSES = new Set<MobilePushDeliveryStatus>([
  'accepted',
  'already-pending',
  'not-registered',
  'unavailable',
  'invalid-registration',
  'rejected'
]);

export class BridgeTransportError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = 'BridgeTransportError';
    this.retryable = retryable;
    this.status = status;
  }
}

export function isRetryableBridgeError(error: unknown) {
  return error instanceof BridgeTransportError && error.retryable;
}

function normalizeBridgeUrl(rawValue: string | undefined) {
  const raw = rawValue?.trim();
  if (!raw) return '';

  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Scopuly Bridge must use HTTPS.');
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/v1')) {
    url.pathname = pathname.slice(0, -3) || '/';
  }

  return url.toString().replace(/\/$/, '');
}

function configuredBridgeUrl() {
  return normalizeBridgeUrl(import.meta.env.VITE_SCOPULY_BRIDGE_URL);
}

function record(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label} response from Scopuly Bridge.`);
  }
  return value as JsonObject;
}

function responseText(value: unknown, label: string, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`Invalid ${label} in Scopuly Bridge response.`);
  }
  return value;
}

function relayAuthorization(relayAccessToken: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(relayAccessToken)) {
    throw new Error('Scopuly Bridge relay access token is invalid.');
  }
  return { Authorization: `Bearer ${relayAccessToken}` };
}

async function inSessionQueue<T>(sessionId: string, task: () => Promise<T>) {
  const previous = sessionQueues.get(sessionId) || Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  sessionQueues.set(sessionId, tail);
  await previous;

  try {
    return await task();
  } finally {
    release();
    if (sessionQueues.get(sessionId) === tail) sessionQueues.delete(sessionId);
  }
}

async function sessionWithChannel(sessionId: string) {
  const sessions = await getMobileSessions();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session?.channel) {
    throw new Error('Scopuly Mobile session has no authenticated encrypted channel.');
  }
  if (session.channel.protocolVersion !== SCOPULY_BRIDGE_PROTOCOL_VERSION) {
    throw new Error('Scopuly Bridge protocol version mismatch.');
  }
  return session;
}

async function encryptForMobile(
  sessionId: string,
  requestId: string,
  expiresAt: number,
  payload: unknown
) {
  return inSessionQueue(sessionId, async () => {
    const session = await sessionWithChannel(sessionId);
    const channel = session.channel!;
    const counter = channel.sendCounter + 1;
    if (!Number.isSafeInteger(counter)) {
      throw new Error('Scopuly Bridge send counter is exhausted; pair the device again.');
    }
    const key = await deriveBridgeEncryptionKey(
      await getBridgePrivateKey(channel.privateKeyId),
      channel.mobilePublicKey,
      channel.pairingId,
      'extension-to-mobile'
    );
    const envelope = await encryptBridgePayload(payload, key, {
      sessionId,
      requestId,
      direction: 'extension-to-mobile',
      counter,
      expiresAt
    });
    await mutateMobileSessions((sessions) => sessions.map((item) => (
      item.id === sessionId
        ? { ...item, channel: { ...channel, sendCounter: counter } }
        : item
    )));
    return envelope;
  });
}

async function decryptFromMobile(
  sessionId: string,
  requestId: string,
  value: unknown
) {
  return inSessionQueue(sessionId, async () => {
    const envelope = parseEncryptedBridgeEnvelope(value);
    const session = await sessionWithChannel(sessionId);
    const channel = session.channel!;
    const key = await deriveBridgeEncryptionKey(
      await getBridgePrivateKey(channel.privateKeyId),
      channel.mobilePublicKey,
      channel.pairingId,
      'mobile-to-extension'
    );
    const payload = await decryptBridgePayload<unknown>(envelope, key, {
      direction: 'mobile-to-extension',
      sessionId,
      requestId,
      minimumCounter: channel.receivedCounters.length
        ? Math.max(...channel.receivedCounters)
        : 0,
      seenCounters: channel.receivedCounters
    });
    const receivedCounters = [...channel.receivedCounters, envelope.counter].slice(-256);
    await mutateMobileSessions((sessions) => sessions.map((item) => (
      item.id === sessionId
        ? { ...item, channel: { ...channel, receivedCounters } }
        : item
    )));
    return payload;
  });
}

export class ScopulyBridgeTransport implements MobileSignerTransport {
  readonly id = 'scopuly-bridge' as const;
  private readonly bridgeUrl?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { bridgeUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.bridgeUrl = options.bridgeUrl;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  private configuredUrl() {
    return this.bridgeUrl === undefined
      ? configuredBridgeUrl()
      : normalizeBridgeUrl(this.bridgeUrl);
  }

  isConfigured() {
    try {
      return Boolean(this.configuredUrl());
    } catch (_error) {
      return false;
    }
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const baseUrl = this.configuredUrl();
    if (!baseUrl) {
      throw new Error('Scopuly Mobile bridge is not configured in this build.');
    }

    const timeoutController = init?.signal ? undefined : new AbortController();
    const timeout = timeoutController
      ? globalThis.setTimeout(
          () => timeoutController.abort(),
          BRIDGE_REQUEST_TIMEOUT_MS
        )
      : undefined;
    let response: Response;
    try {
      const fetchImpl = this.fetchImpl;
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        credentials: 'omit',
        signal: init?.signal || timeoutController?.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(init?.headers || {})
        }
      });
    } catch (error) {
      const timedOut = timeoutController?.signal.aborted === true;
      throw new BridgeTransportError(
        timedOut
          ? 'Scopuly Bridge did not respond in time. The extension will retry.'
          : 'Scopuly Bridge is temporarily unreachable. The extension will retry.',
        true
      );
    } finally {
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as JsonObject;
      const retryable = response.status === 408
        || response.status === 425
        || response.status === 429
        || response.status >= 500;
      throw new BridgeTransportError(
        typeof body.error === 'string'
          ? body.error
          : `Scopuly Bridge returned ${response.status}.`,
        retryable,
        response.status
      );
    }

    if (response.status === 204) return undefined;
    return response.json() as Promise<unknown>;
  }

  private async parseRelayResponse(
    value: unknown,
    context: ProviderStatusContext
  ): Promise<MobileProviderResult> {
    const input = record(value, 'provider relay');
    const status = responseText(input.status, 'provider relay status', 20);
    const transportRequestId = responseText(
      input.transportRequestId,
      'transport request ID'
    );
    if (transportRequestId !== context.transportRequestId) {
      throw new Error('Scopuly Bridge returned a different transport request ID.');
    }
    if (status === 'pending') {
      let pushStatus: MobilePushDeliveryStatus | undefined;

      if (input.push !== undefined) {
        const push = record(input.push, 'push delivery');
        const candidate = responseText(
          push.status,
          'push delivery status',
          30
        ) as MobilePushDeliveryStatus;
        if (!PUSH_DELIVERY_STATUSES.has(candidate)) {
          throw new Error('Unsupported mobile push delivery status.');
        }
        pushStatus = candidate;
      }

      return pushStatus
        ? { status, transportRequestId, pushStatus }
        : { status, transportRequestId };
    }
    if (status !== 'ready') {
      throw new Error('Unsupported provider relay status from Scopuly Bridge.');
    }

    const decrypted = await decryptFromMobile(
      context.sessionId,
      context.requestId,
      input.envelope
    );
    const result = parseMobileProviderResult(decrypted, context.expectedMethod);
    if (result.transportRequestId !== transportRequestId) {
      throw new Error('Encrypted mobile result has a different transport request ID.');
    }
    return result;
  }

  async createPairing() {
    const channel = await generateBridgeKeyPair();
    const privateKeyId = crypto.randomUUID();
    await saveBridgePrivateKey(
      privateKeyId,
      channel.privateKey,
      Date.now() + 10 * 60 * 1000
    );
    try {
      const response = await this.request('/v1/extension/pairings', {
        method: 'POST',
        body: JSON.stringify({
          protocolVersion: SCOPULY_BRIDGE_PROTOCOL_VERSION,
          extensionId: chrome.runtime.id,
          extensionVersion: chrome.runtime.getManifest().version,
          extensionPublicKey: channel.publicKey,
          capabilities: SCOPULY_BRIDGE_CAPABILITIES
        })
      });
      const pairing = parsePairingRequest(response);
      if (pairing.protocolVersion !== SCOPULY_BRIDGE_PROTOCOL_VERSION) {
        throw new Error('Scopuly Bridge protocol version mismatch.');
      }
      if (!pairing.relayAccessToken) {
        throw new Error('Scopuly Bridge did not issue an extension access token.');
      }
      await updateBridgePrivateKeyExpiration(privateKeyId, pairing.expiresAt);
      const uri = new URL(pairing.uri);
      uri.searchParams.set('v', SCOPULY_BRIDGE_PROTOCOL_VERSION);
      uri.searchParams.set('epk', channel.publicKey);
      const {
        relayAccessToken,
        ...publicPairing
      } = pairing;
      return {
        ...publicPairing,
        uri: uri.toString(),
        channel: {
          privateKeyId,
          extensionPublicKey: channel.publicKey,
          relayAccessToken
        }
      };
    } catch (error) {
      await deleteBridgePrivateKey(privateKeyId);
      throw error;
    }
  }

  async getPairingStatus(pairing: PairingRequest): Promise<MobilePairingStatusResult> {
    const response = await this.request(
      `/v1/extension/pairings/${encodeURIComponent(pairing.id)}`,
      { headers: relayAuthorization(pairing.channel?.relayAccessToken || '') }
    );
    const relay = parsePairingRelayStatus(response);
    if (relay.pairing.id !== pairing.id) {
      throw new Error('Scopuly Bridge returned a different pairing ID.');
    }
    if (relay.pairing.protocolVersion !== SCOPULY_BRIDGE_PROTOCOL_VERSION) {
      throw new Error('Scopuly Bridge protocol version mismatch.');
    }
    const pendingResult = {
      pairing: {
        ...relay.pairing,
        uri: pairing.uri,
        channel: pairing.channel
      }
    };
    if (!relay.approvalEnvelope) {
      if (!['pending', 'approved'].includes(relay.pairing.status)) {
        await deleteBridgePrivateKey(pairing.channel?.privateKeyId);
      }
      return pendingResult;
    }
    if (!pairing.channel
      || !relay.sessionId
      || !relay.mobilePublicKey) {
      throw new Error('Approved pairing is missing its authenticated channel.');
    }
    if (relay.approvalEnvelope.counter !== 1
      || relay.approvalEnvelope.expiresAt > pairing.expiresAt) {
      throw new Error('Invalid encrypted pairing approval lifetime or counter.');
    }
    const approvalKey = await deriveBridgeEncryptionKey(
      await getBridgePrivateKey(pairing.channel.privateKeyId),
      relay.mobilePublicKey,
      pairing.id,
      'mobile-to-extension'
    );
    const decrypted = await decryptBridgePayload<unknown>(
      relay.approvalEnvelope,
      approvalKey,
      {
        direction: 'mobile-to-extension',
        sessionId: relay.sessionId,
        requestId: pairing.id,
        minimumCounter: 0
      }
    );
    const result = parseMobilePairingApproval(decrypted);
    if (result.session.id !== relay.sessionId
      || result.session.protocolVersion !== SCOPULY_BRIDGE_PROTOCOL_VERSION) {
      throw new Error('Encrypted pairing approval does not match its relay context.');
    }

    const accounts = result.accounts.map((account) => {
      if (!account.pairingProof) {
        throw new Error('Approved pairing account is missing its mobile proof.');
      }
      verifyPairingProof({
        pairingId: pairing.id,
        sessionId: result.session.id,
        extensionPublicKey: pairing.channel!.extensionPublicKey,
        mobilePublicKey: relay.mobilePublicKey!,
        accountId: account.id,
        accountPublicKey: account.publicKey,
        expiresAt: result.session.expiresAt
      }, account.pairingProof);
      const { pairingProof: _pairingProof, ...verifiedAccount } = account;
      return verifiedAccount;
    });
    const {
      protocolVersion,
      ...sessionWithoutHandshake
    } = result.session;
    await updateBridgePrivateKeyExpiration(
      pairing.channel.privateKeyId,
      result.session.expiresAt
    );
    return {
      pairing: pendingResult.pairing,
      accounts,
      session: {
        ...sessionWithoutHandshake,
        protocolVersion,
        channel: {
          protocolVersion: SCOPULY_BRIDGE_PROTOCOL_VERSION,
          pairingId: pairing.id,
          extensionPublicKey: pairing.channel.extensionPublicKey,
          mobilePublicKey: relay.mobilePublicKey,
          privateKeyId: pairing.channel.privateKeyId,
          relayAccessToken: pairing.channel.relayAccessToken,
          sendCounter: 0,
          receivedCounters: [relay.approvalEnvelope.counter]
        }
      }
    };
  }

  async cancelPairing(pairing: PairingRequest) {
    try {
      await this.request(`/v1/extension/pairings/${encodeURIComponent(pairing.id)}`, {
        method: 'DELETE',
        headers: relayAuthorization(pairing.channel?.relayAccessToken || '')
      });
    } finally {
      await deleteBridgePrivateKey(pairing.channel?.privateKeyId);
    }
  }

  async sendProviderRequest(request: MobileProviderRequest) {
    const envelope = await encryptForMobile(
      request.sessionId,
      request.requestId,
      request.expiresAt,
      request
    );
    const response = await this.request('/v1/extension/provider-requests', {
      method: 'POST',
      headers: relayAuthorization(
        (await sessionWithChannel(request.sessionId)).channel!.relayAccessToken
      ),
      body: JSON.stringify({
        protocolVersion: SCOPULY_BRIDGE_PROTOCOL_VERSION,
        sessionId: request.sessionId,
        requestId: request.requestId,
        envelope
      })
    });
    const outer = record(response, 'provider relay');
    const transportRequestId = responseText(
      outer.transportRequestId,
      'transport request ID'
    );
    return this.parseRelayResponse(response, {
      transportRequestId,
      sessionId: request.sessionId,
      requestId: request.requestId,
      expectedMethod: request.method
    });
  }

  async getProviderRequestStatus(context: ProviderStatusContext) {
    const session = await sessionWithChannel(context.sessionId);
    const response = await this.request(
      `/v1/extension/provider-requests/${encodeURIComponent(context.transportRequestId)}`,
      {
        headers: relayAuthorization(session.channel!.relayAccessToken)
      }
    );
    return this.parseRelayResponse(response, context);
  }

  async cancelProviderRequest(context: ProviderCancelContext) {
    const envelope = await encryptForMobile(
      context.sessionId,
      context.requestId,
      context.expiresAt,
      { action: 'cancel', requestId: context.requestId }
    );
    await this.request(
      `/v1/extension/provider-requests/${encodeURIComponent(context.transportRequestId)}`,
      {
        method: 'DELETE',
        headers: relayAuthorization(
          (await sessionWithChannel(context.sessionId)).channel!.relayAccessToken
        ),
        body: JSON.stringify({
          protocolVersion: SCOPULY_BRIDGE_PROTOCOL_VERSION,
          sessionId: context.sessionId,
          requestId: context.requestId,
          envelope
        })
      }
    );
  }

  async getSessionHealth(session: MobileSession) {
    if (!session.channel) {
      throw new Error('Scopuly Mobile session has no authenticated encrypted channel.');
    }

    // A relay session without its non-extractable local key can never decrypt
    // a mobile response. Detect that state before reporting the session healthy.
    await getBridgePrivateKey(session.channel.privateKeyId);

    const response = record(await this.request(
      `/v1/extension/sessions/${encodeURIComponent(session.id)}`,
      { headers: relayAuthorization(session.channel.relayAccessToken) }
    ), 'session health');
    const status = responseText(response.status, 'session health status', 20);
    const protocolVersion = responseText(
      response.protocolVersion,
      'bridge protocol version',
      20
    );
    const sessionId = responseText(response.sessionId, 'session ID');

    if (status !== 'connected' || sessionId !== session.id) {
      throw new Error('Scopuly Bridge returned a different session health state.');
    }
    if (protocolVersion !== SCOPULY_BRIDGE_PROTOCOL_VERSION) {
      throw new Error('Scopuly Bridge protocol version mismatch.');
    }
    for (const [label, value] of [
      ['session expiration', response.expiresAt],
      ['session activity', response.lastActivityAt],
      ['bridge server time', response.serverTime]
    ] as const) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`Invalid ${label} in Scopuly Bridge response.`);
      }
    }
    if ((response.expiresAt as number) !== session.expiresAt) {
      throw new Error('Scopuly Bridge returned a different session expiration.');
    }

    return Date.now();
  }

  async disconnect(session: MobileSession) {
    if (!session.channel) {
      throw new Error('Scopuly Mobile session has no authenticated encrypted channel.');
    }
    try {
      const requestId = crypto.randomUUID();
      const envelope = await encryptForMobile(
        session.id,
        requestId,
        Math.min(session.expiresAt, Date.now() + 60_000),
        { action: 'disconnect', sessionId: session.id }
      );
      await this.request(`/v1/extension/sessions/${encodeURIComponent(session.id)}`, {
        method: 'DELETE',
        headers: relayAuthorization(session.channel.relayAccessToken),
        body: JSON.stringify({
          protocolVersion: SCOPULY_BRIDGE_PROTOCOL_VERSION,
          sessionId: session.id,
          requestId,
          envelope
        })
      });
    } finally {
      await deleteBridgePrivateKey(session.channel.privateKeyId);
    }
  }
}

export const mobileSignerTransport: MobileSignerTransport = new ScopulyBridgeTransport();
