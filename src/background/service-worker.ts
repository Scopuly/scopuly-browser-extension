import {
  approvePendingRequest,
  consumePendingRequest,
  dismissPendingRequest,
  getPendingRequest,
  getProviderSnapshot,
  handleProviderRequest,
  refreshPendingRequest,
  rejectPendingConnectRequestForWindow,
  rejectPendingRequest,
  rejectPendingRequestsForOrigin,
  rejectPendingRequestsForSession,
  sendPendingRequestToMobile
} from './requests';
import {
  SCOPULY_PROVIDER_ERROR,
  serializeProviderError
} from '../shared/provider-contract';
import {
  cancelMobilePairing,
  disconnectMobileSession,
  disconnectMobileOrigin,
  getMobileState,
  refreshMobileSessionHealth,
  refreshMobilePairing,
  selectMobileAccount,
  setMobileNetwork,
  setMobileTheme,
  startMobilePairing
} from './mobile-state';
import { NETWORKS, type NetworkId } from '../shared/types';
import {
  getDappPolicies,
  getSettings,
  removeDappPolicy,
  removeWalletRecord,
  saveSettings,
  upsertDappPolicy
} from '../shared/storage';
import { reviewTransactionXdr } from '../shared/stellar-review';

function normalizeManagedOrigin(value: unknown) {
  if (typeof value !== 'string') throw new Error('A valid dApp origin is required.');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.origin !== value) {
    throw new Error('A valid HTTP(S) dApp origin is required.');
  }
  return url.origin;
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await saveSettings(settings);
  await getMobileState();
});

chrome.runtime.onStartup.addListener(() => {
  void getMobileState();
});

chrome.windows.onRemoved.addListener((windowId) => {
  void rejectPendingConnectRequestForWindow(windowId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'SCOPULY_GET_STATE':
        return getMobileState();
      case 'SCOPULY_GET_SETTINGS':
        return getSettings();
      case 'SCOPULY_GET_POLICIES':
        return getDappPolicies();
      case 'SCOPULY_REMOVE_LEGACY_WALLET':
        await removeWalletRecord();
        return getMobileState();
      case 'SCOPULY_START_PAIRING':
        return startMobilePairing();
      case 'SCOPULY_REFRESH_PAIRING':
        return refreshMobilePairing();
      case 'SCOPULY_REFRESH_SESSION_HEALTH':
        return refreshMobileSessionHealth();
      case 'SCOPULY_CANCEL_PAIRING':
        return cancelMobilePairing();
      case 'SCOPULY_SELECT_MOBILE_ACCOUNT':
        return selectMobileAccount(message.accountId);
      case 'SCOPULY_DISCONNECT_MOBILE_SESSION':
        await rejectPendingRequestsForSession(message.sessionId);
        return disconnectMobileSession(message.sessionId);
      case 'SCOPULY_SET_NETWORK':
        return setMobileNetwork(message.networkId as NetworkId);
      case 'SCOPULY_SET_THEME':
        return setMobileTheme(message.theme);
      case 'SCOPULY_SAVE_SETTINGS':
        await saveSettings(message.settings || {});
        return getSettings();
      case 'SCOPULY_SET_DAPP_POLICY': {
        const origin = normalizeManagedOrigin(message.origin);
        if (!['trusted', 'blocked'].includes(message.status)) {
          throw new Error('Unsupported dApp policy.');
        }
        const policies = await upsertDappPolicy(origin, message.status, message.name);
        if (message.status === 'blocked') {
          await rejectPendingRequestsForOrigin(origin, 'This dApp was blocked in Scopuly.');
          await disconnectMobileOrigin(origin);
        }
        return policies;
      }
      case 'SCOPULY_REMOVE_DAPP_POLICY':
        return removeDappPolicy(normalizeManagedOrigin(message.origin));
      case 'SCOPULY_DISCONNECT_ORIGIN': {
        const origin = normalizeManagedOrigin(message.origin);
        await rejectPendingRequestsForOrigin(origin);
        return disconnectMobileOrigin(origin);
      }
      case 'SCOPULY_DISCONNECT_ALL_ORIGINS': {
        const state = await getMobileState();
        for (const connection of state.connections) {
          await rejectPendingRequestsForOrigin(connection.origin);
          await disconnectMobileOrigin(connection.origin);
        }
        return getMobileState();
      }
      case 'SCOPULY_DISCONNECT_ALL': {
        const state = await getMobileState();
        for (const session of state.mobileSessions) {
          await rejectPendingRequestsForSession(session.id);
          await disconnectMobileSession(session.id);
        }
        const remaining = await getMobileState();
        for (const connection of remaining.connections) {
          await rejectPendingRequestsForOrigin(connection.origin);
          await disconnectMobileOrigin(connection.origin);
        }
        await cancelMobilePairing();
        return getMobileState();
      }
      case 'SCOPULY_REVIEW_XDR': {
        const settings = await getSettings();
        const passphrase = message.networkPassphrase || NETWORKS[settings.networkId].passphrase;
        return reviewTransactionXdr(message.xdr, passphrase);
      }
      case 'SCOPULY_GET_PENDING_REQUEST':
        return getPendingRequest(message.requestId);
      case 'SCOPULY_REFRESH_PENDING_REQUEST':
        return refreshPendingRequest(message.requestId);
      case 'SCOPULY_SEND_REQUEST_TO_MOBILE':
        await sendPendingRequestToMobile(message.requestId);
        return getPendingRequest(message.requestId);
      case 'SCOPULY_APPROVE_REQUEST':
        return approvePendingRequest(message.requestId);
      case 'SCOPULY_REJECT_REQUEST':
        await rejectPendingRequest(message.requestId, message.reason);
        return { ok: true };
      case 'SCOPULY_DISMISS_PENDING_REQUEST':
        return dismissPendingRequest(message.requestId);
      case 'SCOPULY_PROVIDER_REQUEST':
        return handleProviderRequest(message.payload, sender);
      case 'SCOPULY_PROVIDER_SNAPSHOT':
        return getProviderSnapshot(sender);
      case 'SCOPULY_PROVIDER_REQUEST_STATUS':
        return consumePendingRequest(message.requestId, sender);
      default:
        throw new Error(`Unknown Scopuly message: ${message?.type || 'empty'}`);
    }
  })().then((response) => sendResponse({ ok: true, response })).catch((error) => {
    const isProviderRequest = typeof message?.type === 'string'
      && message.type.startsWith('SCOPULY_PROVIDER');
    sendResponse({
      ok: false,
      error: serializeProviderError(
        error,
        isProviderRequest
          ? SCOPULY_PROVIDER_ERROR.INVALID_REQUEST
          : SCOPULY_PROVIDER_ERROR.INTERNAL
      )
    });
  });

  return true;
});
