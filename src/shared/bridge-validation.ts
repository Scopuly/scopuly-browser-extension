import { StrKey } from '@stellar/stellar-sdk';
import type {
  MobileAccount,
  MobilePairingApproval,
  MobilePairingStatusResult,
  MobileProviderResult,
  MobileSession,
  NetworkId,
  PairingRequest,
  PairingRelayStatus,
  PairingStatus,
  ProviderMethod
} from './types';
import {
  SCOPULY_BRIDGE_PROTOCOL_VERSION,
  SCOPULY_BRIDGE_LIMITS,
  SCOPULY_BRIDGE_PROVIDER_METHODS
} from './bridge-protocol';
import type { EncryptedBridgeEnvelope } from './bridge-protocol';

const NETWORK_IDS = new Set<NetworkId>(['public', 'testnet']);
const PAIRING_STATUSES = new Set<PairingStatus>([
  'pending',
  'approved',
  'expired',
  'cancelled',
  'error'
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label} response from Scopuly Bridge.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`Invalid ${label} in Scopuly Bridge response.`);
  }
  return value;
}

function optionalText(value: unknown, label: string, maxLength = 200) {
  if (value === undefined) return undefined;
  return text(value, label, maxLength);
}

function timestamp(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label} in Scopuly Bridge response.`);
  }
  return value;
}

function parsePairingUri(value: unknown, pairingId: string) {
  const uri = text(value, 'pairing URI', 4_096);
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Invalid pairing URI in Scopuly Bridge response.');
  }
  if (parsed.protocol !== 'scopuly:'
    || parsed.hostname !== 'extension'
    || parsed.pathname !== '/pair'
    || parsed.username
    || parsed.password
    || parsed.searchParams.get('id') !== pairingId) {
    throw new Error('Unsupported pairing URI from Scopuly Bridge.');
  }
  return uri;
}

export function parsePairingRequest(value: unknown): PairingRequest {
  const input = record(value, 'pairing');
  const statusValue = text(input.status, 'pairing status', 20) as PairingStatus;
  if (!PAIRING_STATUSES.has(statusValue)) {
    throw new Error('Unsupported pairing status from Scopuly Bridge.');
  }

  const createdAt = timestamp(input.createdAt, 'pairing creation time');
  const expiresAt = timestamp(input.expiresAt, 'pairing expiration time');
  if (expiresAt <= createdAt) {
    throw new Error('Invalid pairing lifetime from Scopuly Bridge.');
  }

  const id = text(input.id, 'pairing ID');
  return {
    id,
    uri: parsePairingUri(input.uri, id),
    status: statusValue,
    protocolVersion: optionalText(input.protocolVersion, 'bridge protocol version', 20),
    createdAt,
    expiresAt,
    error: optionalText(input.error, 'pairing error', 500),
    relayAccessToken: optionalText(input.extensionAccessToken, 'extension relay access token', 256)
  };
}

function parseMobileSession(value: unknown): MobileSession {
  const input = record(value, 'mobile session');
  const transport = text(input.transport, 'session transport', 30);
  const status = text(input.status, 'session status', 20);
  if (!['scopuly-bridge', 'walletconnect'].includes(transport)) {
    throw new Error('Unsupported mobile session transport.');
  }
  if (!['connected', 'expired', 'revoked'].includes(status)) {
    throw new Error('Unsupported mobile session status.');
  }
  if (!Array.isArray(input.accountIds)
    || !input.accountIds.length
    || input.accountIds.length > SCOPULY_BRIDGE_LIMITS.mobileAccounts) {
    throw new Error('Invalid mobile session accounts.');
  }
  if (!Array.isArray(input.capabilities)
    || !input.capabilities.length
    || input.capabilities.length > SCOPULY_BRIDGE_LIMITS.sessionCapabilities) {
    throw new Error('Invalid mobile session capabilities.');
  }
  const capabilities = input.capabilities.map((value) => {
    const method = text(value, 'mobile session capability', 40) as ProviderMethod;
    if (!SCOPULY_BRIDGE_PROVIDER_METHODS.has(method)) {
      throw new Error('Unsupported mobile session capability.');
    }
    return method;
  });
  if (new Set(capabilities).size !== capabilities.length) {
    throw new Error('Duplicate mobile session capability.');
  }

  const createdAt = timestamp(input.createdAt, 'session creation time');
  const expiresAt = timestamp(input.expiresAt, 'session expiration time');
  if (expiresAt <= createdAt) {
    throw new Error('Invalid mobile session lifetime.');
  }

  const accountIds = input.accountIds.map((id) => text(id, 'session account ID'));
  if (new Set(accountIds).size !== accountIds.length) {
    throw new Error('Duplicate mobile session account.');
  }

  return {
    id: text(input.id, 'session ID'),
    transport: transport as MobileSession['transport'],
    status: status as MobileSession['status'],
    accountIds,
    capabilities,
    createdAt,
    expiresAt,
    lastSeenAt: timestamp(input.lastSeenAt, 'session activity time'),
    protocolVersion: optionalText(input.protocolVersion, 'session protocol version', 20),
    mobilePublicKey: optionalText(input.mobilePublicKey, 'mobile channel public key', 200)
  };
}

function parseMobileAccount(value: unknown): MobileAccount {
  const input = record(value, 'mobile account');
  const device = record(input.device, 'mobile device');
  const publicKey = text(input.publicKey, 'Stellar public key', 80);
  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new Error('Invalid Stellar public key from Scopuly Mobile.');
  }
  if (!Array.isArray(input.supportedNetworks)
    || !input.supportedNetworks.length
    || input.supportedNetworks.length > SCOPULY_BRIDGE_LIMITS.supportedNetworks) {
    throw new Error('Invalid mobile account networks.');
  }
  const supportedNetworks = input.supportedNetworks.map((network) => {
    if (typeof network !== 'string' || !NETWORK_IDS.has(network as NetworkId)) {
      throw new Error('Unsupported mobile account network.');
    }
    return network as NetworkId;
  });
  if (new Set(supportedNetworks).size !== supportedNetworks.length) {
    throw new Error('Duplicate mobile account network.');
  }
  const platform = optionalText(device.platform, 'device platform', 20) || 'unknown';
  if (!['ios', 'android', 'unknown'].includes(platform)) {
    throw new Error('Unsupported mobile device platform.');
  }

  return {
    id: text(input.id, 'mobile account ID'),
    sessionId: text(input.sessionId, 'mobile session ID'),
    publicKey,
    name: text(input.name, 'mobile account name', 80),
    federationAddress: optionalText(input.federationAddress, 'federation address', 255),
    supportedNetworks,
    device: {
      id: text(device.id, 'device ID'),
      name: text(device.name, 'device name', 80),
      platform: platform as MobileAccount['device']['platform'],
      model: optionalText(device.model, 'device model', 80)
    },
    connectedAt: timestamp(input.connectedAt, 'account connection time'),
    lastSeenAt: timestamp(input.lastSeenAt, 'account activity time'),
    pairingProof: optionalText(input.pairingProof, 'account pairing proof', 256)
  };
}

export function parseMobilePairingStatus(value: unknown): MobilePairingStatusResult {
  const input = record(value, 'pairing status');
  const pairing = parsePairingRequest(input.pairing);
  const session = input.session === undefined ? undefined : parseMobileSession(input.session);
  const accounts = input.accounts === undefined
    ? undefined
    : Array.isArray(input.accounts)
        && input.accounts.length <= SCOPULY_BRIDGE_LIMITS.mobileAccounts
      ? input.accounts.map(parseMobileAccount)
      : (() => {
          throw new Error('Invalid mobile accounts response.');
        })();

  if ((session && !accounts?.length) || (!session && accounts?.length)) {
    throw new Error('Incomplete approved pairing response.');
  }
  const accountIds = new Set(accounts?.map((account) => account.id) || []);
  if (session && (accountIds.size !== accounts?.length
    || session.accountIds.length !== accounts?.length
    || session.accountIds.some((id) => !accountIds.has(id))
    || accounts?.some((account) => account.sessionId !== session.id))) {
    throw new Error('Pairing accounts do not belong to the approved session.');
  }

  return { pairing, session, accounts };
}

export function parseMobilePairingApproval(value: unknown): MobilePairingApproval {
  const input = record(value, 'pairing approval');
  const session = parseMobileSession(input.session);
  if (!Array.isArray(input.accounts)
    || !input.accounts.length
    || input.accounts.length > SCOPULY_BRIDGE_LIMITS.mobileAccounts) {
    throw new Error('Approved pairing has no shared mobile accounts.');
  }
  const accounts = input.accounts.map(parseMobileAccount);
  const accountIds = new Set(accounts.map((account) => account.id));
  if (accountIds.size !== accounts.length
    || session.accountIds.length !== accounts.length
    || session.accountIds.some((id) => !accountIds.has(id))
    || accounts.some((account) => account.sessionId !== session.id)) {
    throw new Error('Pairing accounts do not exactly match the approved session.');
  }
  return { session, accounts };
}

export function parsePairingRelayStatus(value: unknown): PairingRelayStatus {
  const input = record(value, 'pairing relay status');
  const pairing = parsePairingRequest(input.pairing);
  const hasApproval = input.sessionId !== undefined
    || input.mobilePublicKey !== undefined
    || input.approvalEnvelope !== undefined;

  if (!hasApproval) {
    if (pairing.status === 'approved') {
      throw new Error('Approved pairing response is missing its encrypted approval.');
    }
    return { pairing };
  }
  if (pairing.status !== 'approved') {
    throw new Error('Only an approved pairing may contain an encrypted approval.');
  }

  return {
    pairing,
    sessionId: text(input.sessionId, 'approved session ID'),
    mobilePublicKey: text(input.mobilePublicKey, 'mobile channel public key', 200),
    approvalEnvelope: parseEncryptedBridgeEnvelope(input.approvalEnvelope)
  };
}

function signerAddress(value: unknown) {
  const address = text(value, 'signer address', 80);
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new Error('Invalid signer address from Scopuly Mobile.');
  }
  return address;
}

function hex(value: unknown, label: string, length: number) {
  const result = text(value, label, length);
  if (result.length !== length || !/^[a-f0-9]+$/i.test(result)) {
    throw new Error(`Invalid ${label} in Scopuly Bridge response.`);
  }
  return result.toLowerCase();
}

function base64Signature(value: unknown) {
  const signature = text(value, 'signed authorization entry', 128);
  try {
    const decoded = atob(signature);
    if (decoded.length !== 64 || btoa(decoded) !== signature) {
      throw new Error('Invalid signature encoding.');
    }
  } catch (_error) {
    throw new Error('Invalid signed authorization entry in Scopuly Bridge response.');
  }
  return signature;
}

function providerMethod(value: unknown, legacyStatus: string): ProviderMethod {
  const method = value === undefined && legacyStatus === 'signed'
    ? 'signTransaction'
    : text(value, 'provider method', 40) as ProviderMethod;
  if (!SCOPULY_BRIDGE_PROVIDER_METHODS.has(method)) {
    throw new Error('Unsupported provider method from Scopuly Bridge.');
  }
  return method;
}

export function parseMobileProviderResult(
  value: unknown,
  expectedMethod?: ProviderMethod
): MobileProviderResult {
  const input = record(value, 'provider request');
  const status = text(input.status, 'provider request status', 20);
  const transportRequestId = text(input.transportRequestId, 'transport request ID');

  if (status === 'pending') return { status, transportRequestId };
  if (status === 'rejected') {
    return {
      status,
      transportRequestId,
      error: optionalText(input.error, 'rejection error', 500)
    };
  }
  if (status === 'failed') {
    return {
      status,
      transportRequestId,
      error: text(input.error, 'bridge error', 500)
    };
  }
  if (status === 'completed' || status === 'signed') {
    const method = providerMethod(input.method, status);
    if (expectedMethod && method !== expectedMethod) {
      throw new Error('Scopuly Mobile returned a result for a different provider method.');
    }

    if (method === 'signTransaction' || method === 'signAndSubmitTransaction') {
      const submissionStatus = optionalText(input.submissionStatus, 'submission status', 20);
      if (submissionStatus && !['success', 'pending'].includes(submissionStatus)) {
        throw new Error('Unsupported transaction submission status from Scopuly Mobile.');
      }
      const hash = input.hash === undefined ? undefined : hex(input.hash, 'transaction hash', 64);
      if (method === 'signAndSubmitTransaction' && (!submissionStatus || !hash)) {
        throw new Error('Incomplete submitted transaction result from Scopuly Mobile.');
      }
      return {
        method,
        status: 'completed',
        transportRequestId,
        signedTxXdr: text(
          input.signedTxXdr,
          'signed transaction XDR',
          SCOPULY_BRIDGE_LIMITS.transactionXdrBytes
        ),
        signerAddress: signerAddress(input.signerAddress),
        submissionStatus: submissionStatus as 'success' | 'pending' | undefined,
        hash
      };
    }

    if (method === 'signMessage') {
      return {
        method,
        status: 'completed',
        transportRequestId,
        signedMessage: hex(input.signedMessage, 'signed message', 128),
        signerAddress: signerAddress(input.signerAddress)
      };
    }

    if (method === 'signAuthEntry') {
      return {
        method,
        status: 'completed',
        transportRequestId,
        signedAuthEntry: base64Signature(input.signedAuthEntry),
        signerAddress: signerAddress(input.signerAddress)
      };
    }

    return {
      method,
      status: 'completed',
      transportRequestId,
      receiptId: hex(input.receiptId, 'receipt ID', 32),
      receiptStatus: text(input.receiptStatus, 'receipt status', 40),
      transaction: input.transaction === undefined
        ? undefined
        : hex(input.transaction, 'receipt transaction hash', 64)
    };
  }
  throw new Error('Unsupported provider request status from Scopuly Bridge.');
}

export const parseMobileSignResult = parseMobileProviderResult;

export function parseEncryptedBridgeEnvelope(value: unknown): EncryptedBridgeEnvelope {
  const input = record(value, 'encrypted envelope');
  const protocolVersion = text(input.protocolVersion, 'bridge protocol version', 20);
  if (protocolVersion !== SCOPULY_BRIDGE_PROTOCOL_VERSION) {
    throw new Error('Scopuly Bridge protocol version mismatch.');
  }
  const direction = text(input.direction, 'bridge envelope direction', 40);
  if (!['extension-to-mobile', 'mobile-to-extension'].includes(direction)) {
    throw new Error('Invalid Scopuly Bridge envelope direction.');
  }
  const counter = input.counter;
  if (typeof counter !== 'number' || !Number.isSafeInteger(counter) || counter <= 0) {
    throw new Error('Invalid Scopuly Bridge envelope counter.');
  }

  return {
    protocolVersion,
    sessionId: text(input.sessionId, 'envelope session ID'),
    requestId: text(input.requestId, 'envelope request ID'),
    direction: direction as EncryptedBridgeEnvelope['direction'],
    counter,
    expiresAt: timestamp(input.expiresAt, 'envelope expiration'),
    nonce: text(input.nonce, 'envelope nonce', 64),
    ciphertext: text(input.ciphertext, 'envelope ciphertext', 1_500_000)
  };
}
