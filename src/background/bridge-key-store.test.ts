import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  BridgePrivateKeyUnavailableError,
  deleteBridgePrivateKey,
  getBridgePrivateKey,
  saveBridgePrivateKey,
  updateBridgePrivateKeyExpiration,
} from './bridge-key-store';
import {
  deriveBridgeEncryptionKey,
  generateBridgeKeyPair,
} from '../shared/bridge-crypto';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extension bridge private key store', () => {
  it('stores only a non-extractable CryptoKey and can restore it for ECDH', async () => {
    const local = await generateBridgeKeyPair();
    const peer = await generateBridgeKeyPair();
    const id = crypto.randomUUID();

    await saveBridgePrivateKey(id, local.privateKey, Date.now() + 60_000);
    const restored = await getBridgePrivateKey(id);

    expect(restored.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('jwk', restored)).rejects.toThrow();
    await expect(deriveBridgeEncryptionKey(
      restored,
      peer.publicKey,
      'key-store-pairing',
      'extension-to-mobile',
    )).resolves.toMatchObject({
      type: 'secret',
      extractable: false,
    });

    await deleteBridgePrivateKey(id);
    await expect(getBridgePrivateKey(id)).rejects.toBeInstanceOf(
      BridgePrivateKeyUnavailableError
    );
  });

  it('enforces key expiration and deletes expired records', async () => {
    const pair = await generateBridgeKeyPair();
    const id = crypto.randomUUID();
    const now = Date.now();

    await saveBridgePrivateKey(id, pair.privateKey, now + 60_000);
    await updateBridgePrivateKeyExpiration(id, now + 120_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 120_001);

    await expect(getBridgePrivateKey(id)).rejects.toBeInstanceOf(
      BridgePrivateKeyUnavailableError
    );
    await expect(getBridgePrivateKey(id)).rejects.toBeInstanceOf(
      BridgePrivateKeyUnavailableError
    );
  });
});
