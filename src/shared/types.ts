import type { EncryptedBridgeEnvelope } from './bridge-protocol';

export const NETWORKS = {
  public: {
    id: 'public',
    label: 'Mainnet',
    chainId: 'stellar:pubnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org'
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    chainId: 'stellar:testnet',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org'
  }
} as const;

export type NetworkId = keyof typeof NETWORKS;
export type ThemeMode = 'dark' | 'light';
export type ProviderSigningMethod =
  | 'signTransaction'
  | 'signAndSubmitTransaction'
  | 'signMessage'
  | 'signAuthEntry';
export type ProviderMethod = ProviderSigningMethod | 'reportX402Receipt';
export type RequestKind =
  | 'connect'
  | 'signXdr'
  | 'signMessage'
  | 'signAuthEntry'
  | 'reportX402'
  | 'reviewXdr';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type DappPolicyStatus = 'trusted' | 'blocked';
export type BridgeStatus = 'disconnected' | 'pairing' | 'connected' | 'expired' | 'error';
export type BridgeHealthStatus =
  | 'unchecked'
  | 'healthy'
  | 'unreachable'
  | 'reconnect-required'
  | 'incompatible';
export type PairingStatus = 'pending' | 'approved' | 'expired' | 'cancelled' | 'error';
export type PendingRequestStatus =
  | 'awaitingApproval'
  | 'awaitingMobile'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'failed';
export type MobilePushDeliveryStatus =
  | 'accepted'
  | 'already-pending'
  | 'not-registered'
  | 'unavailable'
  | 'invalid-registration'
  | 'rejected';

export type DappPolicy = {
  origin: string;
  name?: string;
  status: DappPolicyStatus;
  updatedAt: number;
};

export type OriginRisk = {
  level: RiskLevel;
  hostname: string;
  secure: boolean;
  local: boolean;
  known: boolean;
  policy?: DappPolicyStatus;
  reasons: string[];
};

export type WalletRecord = {
  id: string;
  name: string;
  publicKey: string;
  encryptedSecret: string;
  salt: string;
  iv: string;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  createdAt: number;
};

export type ExtensionSettings = {
  theme: ThemeMode;
  networkId: NetworkId;
  lockMinutes: number;
  requirePasswordForEachSignature: boolean;
  requirePasswordForHighRisk: boolean;
  blockUnsecureOrigins: boolean;
  showAdvancedReview: boolean;
};

export type OriginConnection = {
  origin: string;
  name: string;
  icon?: string;
  accountId?: string;
  publicKey?: string;
  connectedAt: number;
  lastUsedAt: number;
};

export type MobileDevice = {
  id: string;
  name: string;
  platform?: 'ios' | 'android' | 'unknown';
  model?: string;
};

export type MobileAccount = {
  id: string;
  sessionId: string;
  publicKey: string;
  name: string;
  federationAddress?: string;
  supportedNetworks: NetworkId[];
  device: MobileDevice;
  connectedAt: number;
  lastSeenAt: number;
  pairingProof?: string;
};

export type BridgeChannelState = {
  protocolVersion: string;
  pairingId: string;
  extensionPublicKey: string;
  mobilePublicKey: string;
  privateKeyId: string;
  relayAccessToken: string;
  sendCounter: number;
  receivedCounters: number[];
};

export type MobileSession = {
  id: string;
  transport: 'scopuly-bridge' | 'walletconnect';
  status: 'connected' | 'expired' | 'revoked';
  accountIds: string[];
  capabilities: ProviderMethod[];
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  health?: BridgeHealth;
  protocolVersion?: string;
  mobilePublicKey?: string;
  channel?: BridgeChannelState;
};

export type BridgeHealth = {
  status: BridgeHealthStatus;
  checkedAt?: number;
  message?: string;
};

export type PairingRequest = {
  id: string;
  uri: string;
  status: PairingStatus;
  protocolVersion?: string;
  createdAt: number;
  expiresAt: number;
  error?: string;
  relayAccessToken?: string;
  channel?: {
    privateKeyId: string;
    extensionPublicKey: string;
    relayAccessToken: string;
  };
};

export type WalletState = {
  initialized: boolean;
  locked: boolean;
  publicKey?: string;
  walletName?: string;
  networkId: NetworkId;
  theme: ThemeMode;
  lockUntil?: number;
  connections: OriginConnection[];
  policies: DappPolicy[];
  bridgeStatus: BridgeStatus;
  bridgeHealth: BridgeHealth;
  transportConfigured: boolean;
  mobileAccounts: MobileAccount[];
  mobileSessions: MobileSession[];
  selectedAccountId?: string;
  pairing?: PairingRequest;
  legacyWalletPresent: boolean;
};

export type OperationReview = {
  index: number;
  type: string;
  title: string;
  description: string;
  risk: RiskLevel;
  asset?: string;
  amount?: string;
  destination?: string;
  source?: string;
};

export type TransactionReview = {
  ok: boolean;
  xdr: string;
  networkPassphrase: string;
  hash?: string;
  source?: string;
  feeBump?: boolean;
  feeSource?: string;
  fee?: string;
  sequence?: string;
  memo?: string;
  timeBounds?: string;
  risk: RiskLevel;
  warnings: string[];
  operations: OperationReview[];
  error?: string;
};

export type PendingRequest = {
  id: string;
  kind: RequestKind;
  status: PendingRequestStatus;
  origin: string;
  appName: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  accountId?: string;
  publicKey?: string;
  providerMethod?: ProviderMethod;
  confirmationWindowId?: number;
  transportRequestId?: string;
  mobileRequestEnvelope?: EncryptedBridgeEnvelope;
  mobilePollAttempt?: number;
  lastTransportError?: string;
  mobilePushStatus?: MobilePushDeliveryStatus;
  networkPassphrase?: string;
  xdr?: string;
  message?: string;
  messageHash?: string;
  authEntry?: string;
  authEntryFingerprint?: string;
  authEntryReview?: AuthEntryReview;
  messageReview?: MessageReview;
  receipt?: X402ReceiptRequest;
  submit?: boolean;
  review?: TransactionReview;
  originRisk?: OriginRisk;
  result?: ProviderRequestResult;
  error?: string;
  errorCode?: number;
};

export type ProviderRequestResult =
  | { address: string; publicKey?: string }
  | {
      signedTxXdr: string;
      signedXDR: string;
      signerAddress: string;
      hash: string;
      status?: 'success' | 'pending';
    }
  | { signedMessage: string; signerAddress: string }
  | { signedAuthEntry: string; signerAddress: string }
  | { receiptId: string; status: string; transaction?: string };

export type MobilePairingResult = {
  pairing: PairingRequest;
};

export type MobilePairingStatusResult = {
  pairing: PairingRequest;
  session?: MobileSession;
  accounts?: MobileAccount[];
};

export type MobilePairingApproval = {
  session: MobileSession;
  accounts: MobileAccount[];
};

export type PairingRelayStatus = {
  pairing: PairingRequest;
  sessionId?: string;
  mobilePublicKey?: string;
  approvalEnvelope?: import('./bridge-protocol').EncryptedBridgeEnvelope;
};

export type MobileProviderRequestBase = {
  requestId: string;
  sessionId: string;
  accountId: string;
  publicKey: string;
  origin: string;
  appName: string;
  expiresAt: number;
};

export type MobileTransactionRequest = MobileProviderRequestBase & {
  method: 'signTransaction' | 'signAndSubmitTransaction';
  xdr: string;
  networkPassphrase: string;
  transactionHash: string;
  submit: boolean;
};

export type MobileMessageRequest = MobileProviderRequestBase & {
  method: 'signMessage';
  message: string;
  messageHash: string;
  networkPassphrase: string;
};

export type MobileAuthEntryRequest = MobileProviderRequestBase & {
  method: 'signAuthEntry';
  authEntry: string;
  authEntryFingerprint: string;
  networkPassphrase: string;
  expirationLedger: number;
  boundAddress?: string;
};

export type X402ReceiptRequest = {
  receiptId?: string;
  receiptUrl?: string;
};

export type MobileReceiptRequest = MobileProviderRequestBase & {
  method: 'reportX402Receipt';
  receiptId: string;
  receiptUrl: string;
};

export type MobileProviderRequest =
  | MobileTransactionRequest
  | MobileMessageRequest
  | MobileAuthEntryRequest
  | MobileReceiptRequest;

export type MobileTransactionResult = {
  method: 'signTransaction' | 'signAndSubmitTransaction';
  status: 'completed';
  transportRequestId: string;
  signedTxXdr: string;
  signerAddress: string;
  submissionStatus?: 'success' | 'pending';
  hash?: string;
};

export type MobileMessageResult = {
  method: 'signMessage';
  status: 'completed';
  transportRequestId: string;
  signedMessage: string;
  signerAddress: string;
};

export type MobileAuthEntryResult = {
  method: 'signAuthEntry';
  status: 'completed';
  transportRequestId: string;
  signedAuthEntry: string;
  signerAddress: string;
};

export type MobileReceiptResult = {
  method: 'reportX402Receipt';
  status: 'completed';
  transportRequestId: string;
  receiptId: string;
  receiptStatus: string;
  transaction?: string;
};

export type MobileProviderResult =
  | {
      status: 'pending';
      transportRequestId: string;
      pushStatus?: MobilePushDeliveryStatus;
    }
  | MobileTransactionResult
  | MobileMessageResult
  | MobileAuthEntryResult
  | MobileReceiptResult
  | { status: 'rejected'; transportRequestId: string; error?: string }
  | { status: 'failed'; transportRequestId: string; error: string };

export type MessageReview = {
  message: string;
  byteLength: number;
  hash: string;
  warnings: string[];
};

export type AuthEntryInvocationReview = {
  type: string;
  contractAddress?: string;
  functionName?: string;
  argumentsCount: number;
  invocationsCount: number;
  subInvocationsCount: number;
};

export type AuthEntryReview = {
  authEntry: string;
  networkPassphrase: string;
  fingerprint: string;
  envelopeType: string;
  expirationLedger: number;
  nonce: string;
  boundAddress?: string;
  invocation: AuthEntryInvocationReview;
  warnings: string[];
};

export type AccountSummary = {
  exists: boolean;
  publicKey: string;
  balances: Array<{ asset: string; balance: string; issuer?: string }>;
  subentryCount?: number;
  error?: string;
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: 'dark',
  networkId: 'public',
  lockMinutes: 15,
  requirePasswordForEachSignature: false,
  requirePasswordForHighRisk: true,
  blockUnsecureOrigins: true,
  showAdvancedReview: true
};
