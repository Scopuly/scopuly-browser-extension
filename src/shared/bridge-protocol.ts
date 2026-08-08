import type { ProviderMethod } from './types';

export const SCOPULY_BRIDGE_PROTOCOL_VERSION = '1.0';

export const SCOPULY_BRIDGE_CAPABILITIES = [
  'stellar:pubnet',
  'stellar:testnet',
  'signTransaction',
  'signAndSubmitTransaction',
  'signMessage',
  'signAuthEntry',
  'reportX402Receipt'
] as const;

export const SCOPULY_BRIDGE_PROVIDER_METHODS = new Set<ProviderMethod>([
  'signTransaction',
  'signAndSubmitTransaction',
  'signMessage',
  'signAuthEntry',
  'reportX402Receipt'
]);

export const SCOPULY_BRIDGE_LIMITS = {
  mobileAccounts: 20,
  sessionCapabilities: 5,
  supportedNetworks: 2,
  transactionXdrBytes: 512 * 1024,
  authEntryXdrBytes: 256 * 1024,
  messageBytes: 16 * 1024,
  receiptUrlBytes: 512,
  responseTextBytes: 512
} as const;

export type BridgeDirection = 'extension-to-mobile' | 'mobile-to-extension';

export type EncryptedBridgeEnvelope = {
  protocolVersion: typeof SCOPULY_BRIDGE_PROTOCOL_VERSION;
  sessionId: string;
  requestId: string;
  direction: BridgeDirection;
  counter: number;
  expiresAt: number;
  nonce: string;
  ciphertext: string;
};

export type BridgeKeyPair = {
  privateKey: CryptoKey;
  publicKey: string;
};

export type PairingProofPayload = {
  pairingId: string;
  sessionId: string;
  extensionPublicKey: string;
  mobilePublicKey: string;
  accountId: string;
  accountPublicKey: string;
  expiresAt: number;
};
