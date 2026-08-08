import * as StellarSdk from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { SCOPULY_BRIDGE_LIMITS } from './bridge-protocol';
import type {
  AuthEntryInvocationReview,
  AuthEntryReview,
  MessageReview,
  X402ReceiptRequest
} from './types';

const STELLAR_SIGNED_MESSAGE_PREFIX = 'Stellar Signed Message:\n';
const X402_RECEIPT_PATH = /^\/x402\/receipt\/([a-f0-9]{32})$/;

function messagePayload(message: string) {
  if (typeof message !== 'string') throw new Error('Message must be a UTF-8 string.');
  const messageBytes = Buffer.from(message, 'utf8');
  if (messageBytes.length > SCOPULY_BRIDGE_LIMITS.messageBytes) {
    throw new Error(`Message exceeds the ${SCOPULY_BRIDGE_LIMITS.messageBytes}-byte signing limit.`);
  }
  return Buffer.concat([
    Buffer.from(STELLAR_SIGNED_MESSAGE_PREFIX, 'utf8'),
    messageBytes
  ]);
}

export function reviewMessage(message: string): MessageReview {
  const payload = messagePayload(message);
  const byteLength = Buffer.byteLength(message, 'utf8');
  const warnings: string[] = [];
  if (!message.length) warnings.push('This request signs an empty message.');
  if (message !== message.trim()) {
    warnings.push('Leading or trailing whitespace is part of the signed message.');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) {
    warnings.push('The message contains non-printing control characters.');
  }

  return {
    message,
    byteLength,
    hash: StellarSdk.hash(payload).toString('hex'),
    warnings
  };
}

export function verifySignedMessage(
  message: string,
  signedMessage: string,
  expectedSigner: string
) {
  if (!/^[a-f0-9]{128}$/i.test(signedMessage)) {
    throw new Error('Scopuly Mobile returned an invalid message signature.');
  }
  const signature = Buffer.from(signedMessage, 'hex');
  const keypair = StellarSdk.Keypair.fromPublicKey(expectedSigner);
  if (!keypair.verifyMessage(message, signature)) {
    throw new Error('The mobile message signature does not match the connected account.');
  }
  return {
    signedMessage: signature.toString('hex'),
    signerAddress: expectedSigner
  };
}

function decodeXdrString(value: unknown) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return String(value || '');
}

function countInvocations(invocation: any): number {
  if (!invocation) return 0;
  return 1 + (invocation.subInvocations?.() || [])
    .reduce((total: number, child: unknown) => total + countInvocations(child), 0);
}

function summarizeInvocation(invocation: any): AuthEntryInvocationReview {
  const authorizedFunction = invocation?.function?.();
  const type = authorizedFunction?.switch?.()?.name || 'unknown';
  const subInvocationsCount = invocation?.subInvocations?.()?.length || 0;
  const summary: AuthEntryInvocationReview = {
    type,
    argumentsCount: 0,
    invocationsCount: countInvocations(invocation),
    subInvocationsCount
  };

  if (type !== 'sorobanAuthorizedFunctionTypeContractFn') return summary;
  const contractFn = authorizedFunction.contractFn();
  return {
    ...summary,
    contractAddress: StellarSdk.Address.fromScAddress(contractFn.contractAddress()).toString(),
    functionName: decodeXdrString(contractFn.functionName()),
    argumentsCount: contractFn.args?.()?.length || 0
  };
}

export function reviewAuthEntry(
  authEntry: string,
  networkPassphrase: string,
  expectedSigner: string
): AuthEntryReview {
  if (typeof authEntry !== 'string' || !authEntry.trim()) {
    throw new Error('Soroban authorization entry XDR is required.');
  }
  if (authEntry.length > SCOPULY_BRIDGE_LIMITS.authEntryXdrBytes) {
    throw new Error('Soroban authorization entry exceeds the Scopuly safety limit.');
  }

  try {
    const preimage = StellarSdk.xdr.HashIdPreimage.fromXDR(authEntry, 'base64');
    const envelopeType = preimage.switch()?.name;
    const legacyType = 'envelopeTypeSorobanAuthorization';
    const addressBoundType = 'envelopeTypeSorobanAuthorizationWithAddress';
    if (![legacyType, addressBoundType].includes(envelopeType)) {
      throw new Error('XDR is not a Soroban authorization preimage.');
    }

    const authorization: any = envelopeType === addressBoundType
      ? preimage.sorobanAuthorizationWithAddress()
      : preimage.sorobanAuthorization();
    const expectedNetworkId = StellarSdk.hash(Buffer.from(networkPassphrase, 'utf8'));
    if (!authorization.networkId().equals(expectedNetworkId)) {
      throw new Error('Soroban authorization entry is for a different Stellar network.');
    }

    const expirationLedger = Number(authorization.signatureExpirationLedger());
    if (!Number.isSafeInteger(expirationLedger) || expirationLedger <= 0) {
      throw new Error('Soroban authorization entry has an invalid expiration ledger.');
    }

    const boundAddress = envelopeType === addressBoundType
      ? StellarSdk.Address.fromScAddress(authorization.address()).toString()
      : '';
    if (boundAddress && boundAddress !== expectedSigner) {
      throw new Error('Soroban authorization is bound to a different Stellar account.');
    }

    const invocation = summarizeInvocation(authorization.invocation());
    const warnings: string[] = [];
    if (!boundAddress) {
      warnings.push('This legacy authorization preimage is not address-bound.');
    }
    if (invocation.subInvocationsCount > 0) {
      warnings.push('This authorization includes nested contract invocations.');
    }
    if (invocation.type !== 'sorobanAuthorizedFunctionTypeContractFn') {
      warnings.push('This authorization is not a standard contract function call.');
    }

    return {
      authEntry,
      networkPassphrase,
      fingerprint: StellarSdk.hash(preimage.toXDR()).toString('hex'),
      envelopeType,
      expirationLedger,
      nonce: authorization.nonce().toString(),
      boundAddress: boundAddress || undefined,
      invocation,
      warnings
    };
  } catch (error) {
    if (error instanceof Error && /Soroban authorization|XDR is not/.test(error.message)) {
      throw error;
    }
    throw new Error('Soroban authorization entry XDR could not be decoded.');
  }
}

export function verifySignedAuthEntry(
  authEntry: string,
  signedAuthEntry: string,
  expectedSigner: string
) {
  const preimage = StellarSdk.xdr.HashIdPreimage.fromXDR(authEntry, 'base64');
  const signature = Buffer.from(signedAuthEntry, 'base64');
  if (signature.length !== 64) {
    throw new Error('Scopuly Mobile returned an invalid authorization signature.');
  }
  const payloadHash = StellarSdk.hash(preimage.toXDR());
  const keypair = StellarSdk.Keypair.fromPublicKey(expectedSigner);
  if (!keypair.verify(payloadHash, signature)) {
    throw new Error('The mobile authorization signature does not match the connected account.');
  }
  return {
    signedAuthEntry: signature.toString('base64'),
    signerAddress: expectedSigner
  };
}

export function normalizeX402Receipt(receipt: X402ReceiptRequest) {
  const providedId = typeof receipt?.receiptId === 'string'
    ? receipt.receiptId.toLowerCase()
    : '';
  if (providedId && !/^[a-f0-9]{32}$/.test(providedId)) {
    throw new Error('Invalid Scopuly x402 receipt ID.');
  }

  let urlId = '';
  if (receipt?.receiptUrl !== undefined) {
    if (typeof receipt.receiptUrl !== 'string'
      || receipt.receiptUrl.length > SCOPULY_BRIDGE_LIMITS.receiptUrlBytes) {
      throw new Error('Invalid Scopuly x402 receipt URL.');
    }
    let url: URL;
    try {
      url = new URL(receipt.receiptUrl);
    } catch (_error) {
      throw new Error('Invalid Scopuly x402 receipt URL.');
    }
    const match = url.pathname.match(X402_RECEIPT_PATH);
    if (url.protocol !== 'https:'
      || url.hostname !== 'api.scopuly.com'
      || url.port
      || url.username
      || url.password
      || url.search
      || url.hash
      || !match) {
      throw new Error('Scopuly only accepts receipts from its canonical HTTPS endpoint.');
    }
    urlId = match[1];
  }

  const receiptId = providedId || urlId;
  if (!receiptId) throw new Error('A Scopuly x402 receipt ID is required.');
  if (providedId && urlId && providedId !== urlId) {
    throw new Error('Scopuly x402 receipt ID does not match its URL.');
  }

  return {
    receiptId,
    receiptUrl: `https://api.scopuly.com/x402/receipt/${receiptId}`
  };
}
