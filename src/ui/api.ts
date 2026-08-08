import type {
  DappPolicy,
  DappPolicyStatus,
  ExtensionSettings,
  MobilePairingStatusResult,
  NetworkId,
  PairingRequest,
  PendingRequest,
  ThemeMode,
  TransactionReview,
  WalletState
} from '../shared/types';
import { providerErrorMessage } from '../shared/provider-contract';

async function send<T>(message: Record<string, unknown>): Promise<T> {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) {
    throw new Error(providerErrorMessage(result?.error, 'Scopuly extension request failed.'));
  }
  return result.response as T;
}

export const api = {
  getState: () => send<WalletState>({ type: 'SCOPULY_GET_STATE' }),
  getSettings: () => send<ExtensionSettings>({ type: 'SCOPULY_GET_SETTINGS' }),
  getPolicies: () => send<DappPolicy[]>({ type: 'SCOPULY_GET_POLICIES' }),
  removeLegacyWallet: () => send<WalletState>({ type: 'SCOPULY_REMOVE_LEGACY_WALLET' }),
  startPairing: () => send<PairingRequest>({ type: 'SCOPULY_START_PAIRING' }),
  refreshPairing: () => send<MobilePairingStatusResult>({ type: 'SCOPULY_REFRESH_PAIRING' }),
  refreshSessionHealth: () =>
    send<WalletState>({ type: 'SCOPULY_REFRESH_SESSION_HEALTH' }),
  cancelPairing: () => send<WalletState>({ type: 'SCOPULY_CANCEL_PAIRING' }),
  selectMobileAccount: (accountId: string) =>
    send<WalletState>({ type: 'SCOPULY_SELECT_MOBILE_ACCOUNT', accountId }),
  disconnectMobileSession: (sessionId: string) =>
    send<WalletState>({ type: 'SCOPULY_DISCONNECT_MOBILE_SESSION', sessionId }),
  setNetwork: (networkId: NetworkId) => send<WalletState>({ type: 'SCOPULY_SET_NETWORK', networkId }),
  setTheme: (theme: ThemeMode) => send<WalletState>({ type: 'SCOPULY_SET_THEME', theme }),
  saveSettings: (settings: Partial<ExtensionSettings>) =>
    send<ExtensionSettings>({ type: 'SCOPULY_SAVE_SETTINGS', settings }),
  setDappPolicy: (origin: string, status: DappPolicyStatus, name?: string) =>
    send<DappPolicy[]>({ type: 'SCOPULY_SET_DAPP_POLICY', origin, status, name }),
  removeDappPolicy: (origin: string) =>
    send<DappPolicy[]>({ type: 'SCOPULY_REMOVE_DAPP_POLICY', origin }),
  disconnectOrigin: (origin: string) =>
    send<WalletState>({ type: 'SCOPULY_DISCONNECT_ORIGIN', origin }),
  reviewXdr: (xdr: string, networkPassphrase?: string) =>
    send<TransactionReview>({ type: 'SCOPULY_REVIEW_XDR', xdr, networkPassphrase }),
  getPendingRequest: (requestId: string) =>
    send<PendingRequest | null>({ type: 'SCOPULY_GET_PENDING_REQUEST', requestId }),
  refreshPendingRequest: (requestId: string) =>
    send<PendingRequest | null>({ type: 'SCOPULY_REFRESH_PENDING_REQUEST', requestId }),
  sendRequestToMobile: (requestId: string) =>
    send<PendingRequest | null>({ type: 'SCOPULY_SEND_REQUEST_TO_MOBILE', requestId }),
  approveRequest: (requestId: string) =>
    send<unknown>({ type: 'SCOPULY_APPROVE_REQUEST', requestId }),
  rejectRequest: (requestId: string, reason?: string) =>
    send<{ ok: true }>({ type: 'SCOPULY_REJECT_REQUEST', requestId, reason })
};
