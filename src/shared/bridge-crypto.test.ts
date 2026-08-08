import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import fixture from '../../protocol/fixtures/bridge-v1.json';
import {
  decryptBridgePayload,
  deriveBridgeEncryptionKey,
  encryptBridgePayload,
  generateBridgeKeyPair,
  pairingProofHash,
  verifyPairingProof
} from './bridge-crypto';
import type { PairingProofPayload } from './bridge-protocol';
import type {
  EncryptedBridgeEnvelope
} from './bridge-protocol';

describe('Scopuly Bridge encrypted channel', () => {
  it('derives matching directional keys and round-trips an authenticated payload', async () => {
    const extension = await generateBridgeKeyPair();
    const mobile = await generateBridgeKeyPair();
    expect(extension.privateKey.extractable).toBe(false);
    await expect(
      crypto.subtle.exportKey('jwk', extension.privateKey)
    ).rejects.toThrow();
    const extensionKey = await deriveBridgeEncryptionKey(
      extension.privateKey,
      mobile.publicKey,
      'pairing-1',
      'extension-to-mobile'
    );
    const mobileKey = await deriveBridgeEncryptionKey(
      mobile.privateKey,
      extension.publicKey,
      'pairing-1',
      'extension-to-mobile'
    );
    const envelope = await encryptBridgePayload(
      { method: 'signMessage', message: 'hello' },
      extensionKey,
      {
        sessionId: 'session-1',
        requestId: 'request-1',
        direction: 'extension-to-mobile',
        counter: 1,
        expiresAt: Date.now() + 60_000
      }
    );

    await expect(decryptBridgePayload(envelope, mobileKey, {
      direction: 'extension-to-mobile',
      sessionId: 'session-1',
      requestId: 'request-1',
      minimumCounter: 0
    })).resolves.toEqual({ method: 'signMessage', message: 'hello' });
  });

  it('rejects tampering, context substitution, replay and expiry', async () => {
    const extension = await generateBridgeKeyPair();
    const mobile = await generateBridgeKeyPair();
    const key = await deriveBridgeEncryptionKey(
      extension.privateKey,
      mobile.publicKey,
      'pairing-2',
      'extension-to-mobile'
    );
    const peerKey = await deriveBridgeEncryptionKey(
      mobile.privateKey,
      extension.publicKey,
      'pairing-2',
      'extension-to-mobile'
    );
    const envelope = await encryptBridgePayload({ ok: true }, key, {
      sessionId: 'session-2',
      requestId: 'request-2',
      direction: 'extension-to-mobile',
      counter: 7,
      expiresAt: Date.now() + 60_000
    });
    const replacement = envelope.ciphertext.endsWith('A') ? 'B' : 'A';

    await expect(decryptBridgePayload(
      {
        ...envelope,
        ciphertext: `${envelope.ciphertext.slice(0, -1)}${replacement}`
      },
      peerKey,
      {
        direction: 'extension-to-mobile',
        sessionId: 'session-2',
        requestId: 'request-2',
        minimumCounter: 0
      }
    )).rejects.toThrow('authentication failed');
    await expect(decryptBridgePayload(envelope, peerKey, {
      direction: 'mobile-to-extension',
      sessionId: 'session-2',
      requestId: 'request-2',
      minimumCounter: 0
    })).rejects.toThrow('context mismatch');
    await expect(decryptBridgePayload(envelope, peerKey, {
      direction: 'extension-to-mobile',
      sessionId: 'session-2',
      requestId: 'request-2',
      minimumCounter: 7
    })).rejects.toThrow('reused or reordered');
    await expect(decryptBridgePayload(envelope, peerKey, {
      direction: 'extension-to-mobile',
      sessionId: 'session-2',
      requestId: 'request-2',
      minimumCounter: 0,
      now: envelope.expiresAt
    })).rejects.toThrow('expired');
  });

  it('authenticates the pairing transcript with the shared Stellar account', () => {
    const account = Keypair.random();
    const payload: PairingProofPayload = {
      pairingId: 'pairing-3',
      sessionId: 'session-3',
      extensionPublicKey: 'extension-key',
      mobilePublicKey: 'mobile-key',
      accountId: 'account-3',
      accountPublicKey: account.publicKey(),
      expiresAt: Date.now() + 60_000
    };
    const signature = account.sign(pairingProofHash(payload)).toString('base64');

    expect(verifyPairingProof(payload, signature)).toBe(true);
    expect(() => verifyPairingProof(
      { ...payload, sessionId: 'substituted-session' },
      signature
    )).toThrow('does not match');
  });

  it('matches the shared protocol v1 cross-runtime fixture', async () => {
    const key = await deriveBridgeEncryptionKey(
      fixture.mobileKeyPair.privateKeyJwk,
      fixture.extensionKeyPair.publicKey,
      fixture.pairingId,
      'extension-to-mobile'
    );
    await expect(decryptBridgePayload(
      fixture.envelope as EncryptedBridgeEnvelope,
      key,
      {
        direction: 'extension-to-mobile',
        sessionId: fixture.sessionId,
        requestId: fixture.requestId,
        minimumCounter: 0,
        now: 1
      }
    )).resolves.toEqual(fixture.decryptedPayload);

    expect(verifyPairingProof(
      fixture.pairingProof.payload as PairingProofPayload,
      fixture.pairingProof.signatureBase64
    )).toBe(true);
    expect(
      pairingProofHash(fixture.pairingProof.payload as PairingProofPayload).toString('hex')
    ).toBe(fixture.pairingProof.hashHex);
  });
});
