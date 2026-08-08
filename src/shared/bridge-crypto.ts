import * as StellarSdk from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import {
  SCOPULY_BRIDGE_PROTOCOL_VERSION,
  type BridgeDirection,
  type BridgeKeyPair,
  type EncryptedBridgeEnvelope,
  type PairingProofPayload
} from './bridge-protocol';

const encoder = new TextEncoder();
const MAX_ENVELOPE_CIPHERTEXT_BYTES = 1024 * 1024;
const PAIRING_PROOF_PREFIX = 'Scopuly Bridge Pairing Proof v1\n';

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function base64UrlEncode(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string, label: string) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - value.length % 4) % 4);
  const bytes = Buffer.from(padded, 'base64');
  if (!bytes.length) throw new Error(`Invalid ${label}.`);
  if (base64UrlEncode(bytes) !== value) throw new Error(`Invalid ${label}.`);
  return new Uint8Array(bytes);
}

function canonicalHeader(input: {
  protocolVersion: string;
  sessionId: string;
  requestId: string;
  direction: BridgeDirection;
  counter: number;
  expiresAt: number;
}) {
  return encoder.encode(JSON.stringify([
    'scopuly-bridge-envelope',
    input.protocolVersion,
    input.sessionId,
    input.requestId,
    input.direction,
    input.counter,
    input.expiresAt
  ]));
}

function validateIdentifier(value: string, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new Error(`Invalid bridge ${label}.`);
  }
  return value;
}

function validateCounter(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Invalid bridge envelope counter.');
  }
  return value;
}

export async function generateBridgeKeyPair(): Promise<BridgeKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  return {
    privateKey: keyPair.privateKey,
    publicKey: base64UrlEncode(publicKeyRaw)
  };
}

async function resolvePrivateKey(privateKey: CryptoKey | JsonWebKey) {
  if ('type' in privateKey) {
    if (privateKey.type !== 'private'
      || privateKey.algorithm.name !== 'ECDH'
      || (privateKey.algorithm as EcKeyAlgorithm).namedCurve !== 'P-256'
      || !privateKey.usages.includes('deriveBits')) {
      throw new Error('Invalid Scopuly bridge private CryptoKey.');
    }
    return privateKey;
  }
  const privateKeyJwk = privateKey;
  if (privateKeyJwk.kty !== 'EC'
    || privateKeyJwk.crv !== 'P-256'
    || !privateKeyJwk.d
    || !privateKeyJwk.x
    || !privateKeyJwk.y) {
    throw new Error('Invalid Scopuly bridge private key.');
  }
  return crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

async function importPeerPublicKey(publicKey: string) {
  const raw = base64UrlDecode(publicKey, 'Scopuly bridge public key');
  if (raw.length !== 65 || raw[0] !== 4) {
    throw new Error('Invalid Scopuly bridge P-256 public key.');
  }
  return crypto.subtle.importKey(
    'raw',
    arrayBuffer(raw),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

export async function deriveBridgeEncryptionKey(
  privateKey: CryptoKey | JsonWebKey,
  peerPublicKey: string,
  pairingId: string,
  direction: BridgeDirection
) {
  validateIdentifier(pairingId, 'pairing ID');
  const [localPrivateKey, publicKey] = await Promise.all([
    resolvePrivateKey(privateKey),
    importPeerPublicKey(peerPublicKey)
  ]);
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    localPrivateKey,
    256
  );
  const hkdfMaterial = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveKey']
  );
  const salt = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`scopuly-bridge-v1:${pairingId}`)
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode(`scopuly-bridge-v1:${direction}`)
    },
    hkdfMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBridgePayload(
  payload: unknown,
  key: CryptoKey,
  header: Omit<EncryptedBridgeEnvelope, 'protocolVersion' | 'nonce' | 'ciphertext'>
): Promise<EncryptedBridgeEnvelope> {
  validateIdentifier(header.sessionId, 'session ID');
  validateIdentifier(header.requestId, 'request ID');
  validateCounter(header.counter);
  if (!Number.isSafeInteger(header.expiresAt) || header.expiresAt <= Date.now()) {
    throw new Error('Bridge envelope expiration must be in the future.');
  }

  const plaintext = encoder.encode(JSON.stringify(payload));
  if (plaintext.length > MAX_ENVELOPE_CIPHERTEXT_BYTES) {
    throw new Error('Bridge payload exceeds the Scopuly safety limit.');
  }
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const authenticatedHeader: Omit<EncryptedBridgeEnvelope, 'nonce' | 'ciphertext'> = {
    protocolVersion: SCOPULY_BRIDGE_PROTOCOL_VERSION,
    ...header
  };
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: arrayBuffer(nonce),
      additionalData: arrayBuffer(canonicalHeader(authenticatedHeader)),
      tagLength: 128
    },
    key,
    arrayBuffer(plaintext)
  );

  return {
    ...authenticatedHeader,
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext)
  };
}

export async function decryptBridgePayload<T>(
  envelope: EncryptedBridgeEnvelope,
  key: CryptoKey,
  expected: {
    direction: BridgeDirection;
    sessionId: string;
    requestId: string;
    minimumCounter?: number;
    seenCounters?: readonly number[];
    now?: number;
  }
): Promise<T> {
  if (envelope.protocolVersion !== SCOPULY_BRIDGE_PROTOCOL_VERSION) {
    throw new Error('Scopuly Bridge protocol version mismatch.');
  }
  if (envelope.direction !== expected.direction
    || envelope.sessionId !== expected.sessionId
    || envelope.requestId !== expected.requestId) {
    throw new Error('Scopuly Bridge envelope context mismatch.');
  }
  validateIdentifier(envelope.sessionId, 'session ID');
  validateIdentifier(envelope.requestId, 'request ID');
  validateCounter(envelope.counter);
  if ((expected.minimumCounter !== undefined && envelope.counter <= expected.minimumCounter)
    || expected.seenCounters?.includes(envelope.counter)) {
    throw new Error('Scopuly Bridge replay counter was reused or reordered.');
  }
  const now = expected.now ?? Date.now();
  if (!Number.isSafeInteger(envelope.expiresAt) || envelope.expiresAt <= now) {
    throw new Error('Scopuly Bridge envelope expired.');
  }

  const nonce = base64UrlDecode(envelope.nonce, 'Scopuly bridge nonce');
  if (nonce.length !== 12) throw new Error('Invalid Scopuly bridge nonce.');
  const ciphertext = base64UrlDecode(envelope.ciphertext, 'Scopuly bridge ciphertext');
  if (ciphertext.length < 17 || ciphertext.length > MAX_ENVELOPE_CIPHERTEXT_BYTES + 16) {
    throw new Error('Invalid Scopuly bridge ciphertext length.');
  }

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: arrayBuffer(nonce),
        additionalData: arrayBuffer(canonicalHeader(envelope)),
        tagLength: 128
      },
      key,
      arrayBuffer(ciphertext)
    );
  } catch (_error) {
    throw new Error('Scopuly Bridge envelope authentication failed.');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch (_error) {
    throw new Error('Scopuly Bridge encrypted payload is not valid JSON.');
  }
}

export function pairingProofHash(payload: PairingProofPayload) {
  const canonical = JSON.stringify([
    SCOPULY_BRIDGE_PROTOCOL_VERSION,
    payload.pairingId,
    payload.sessionId,
    payload.extensionPublicKey,
    payload.mobilePublicKey,
    payload.accountId,
    payload.accountPublicKey,
    payload.expiresAt
  ]);
  return StellarSdk.hash(Buffer.concat([
    Buffer.from(PAIRING_PROOF_PREFIX, 'utf8'),
    Buffer.from(canonical, 'utf8')
  ]));
}

export function verifyPairingProof(payload: PairingProofPayload, signature: string) {
  const decoded = Buffer.from(signature, 'base64');
  if (decoded.length !== 64) throw new Error('Invalid Scopuly mobile pairing proof.');
  const signer = StellarSdk.Keypair.fromPublicKey(payload.accountPublicKey);
  if (!signer.verify(pairingProofHash(payload), decoded)) {
    throw new Error('Scopuly mobile pairing proof does not match the shared account.');
  }
  return true;
}
