import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  SCOPULY_EXTENSION_ID,
  ScopulyExtensionModule,
} from './scopuly-extension.module.mjs';

const provider = (overrides = {}) => ({
  isScopuly: true,
  platform: 'extension',
  requestAccess: vi.fn().mockResolvedValue({address: 'GSCOPULY'}),
  getAddress: vi.fn().mockResolvedValue({address: 'GSCOPULY'}),
  isConnected: vi.fn().mockResolvedValue({isConnected: true}),
  getNetwork: vi.fn().mockResolvedValue({
    network: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }),
  signTransaction: vi.fn().mockResolvedValue({
    signedTxXdr: 'signed-xdr',
    signerAddress: 'GSCOPULY',
  }),
  signAndSubmitTransaction: vi.fn().mockResolvedValue({
    signedTxXdr: 'signed-xdr',
    signerAddress: 'GSCOPULY',
    status: 'success',
  }),
  signAuthEntry: vi.fn().mockResolvedValue({
    signedAuthEntry: 'auth-signature',
    signerAddress: 'GSCOPULY',
  }),
  signMessage: vi.fn().mockResolvedValue({
    signedMessage: 'message-signature',
    signerAddress: 'GSCOPULY',
  }),
  reportX402Receipt: vi.fn().mockResolvedValue({
    receiptId: 'receipt-id',
    status: 'settled',
  }),
  disconnect: vi.fn().mockResolvedValue(undefined),
  onChange: vi.fn(),
  ...overrides,
});

const installProvider = (current) => {
  vi.stubGlobal('window', {scopuly: current});
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Scopuly Stellar Wallets Kit module', () => {
  it('detects only the browser extension provider', async () => {
    const current = provider();
    installProvider(current);
    const module = new ScopulyExtensionModule();

    expect(module.productId).toBe(SCOPULY_EXTENSION_ID);
    await expect(module.isAvailable()).resolves.toBe(true);
    await expect(module.isPlatformWrapper()).resolves.toBe(false);

    installProvider({...current, platform: 'mobile'});
    await expect(module.isAvailable()).resolves.toBe(false);
  });

  it('uses requestAccess unless the kit explicitly skips it', async () => {
    const current = provider();
    installProvider(current);
    const module = new ScopulyExtensionModule();

    await expect(module.getAddress()).resolves.toEqual({address: 'GSCOPULY'});
    expect(current.requestAccess).toHaveBeenCalledOnce();

    await expect(module.getAddress({skipRequestAccess: true})).resolves.toEqual({
      address: 'GSCOPULY',
    });
    expect(current.isConnected).toHaveBeenCalledOnce();
    expect(current.getAddress).toHaveBeenCalledOnce();
  });

  it('maps all Wallets Kit signing methods without changing their inputs', async () => {
    const current = provider();
    installProvider(current);
    const module = new ScopulyExtensionModule();
    const opts = {
      address: 'GSCOPULY',
      networkPassphrase: 'Test SDF Network ; September 2015',
    };

    await expect(module.signTransaction('xdr', opts)).resolves.toEqual({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GSCOPULY',
    });
    await expect(module.signAndSubmitTransaction('xdr', opts)).resolves.toEqual({
      status: 'success',
    });
    await expect(module.signAuthEntry('auth', opts)).resolves.toEqual({
      signedAuthEntry: 'auth-signature',
      signerAddress: 'GSCOPULY',
    });
    await expect(module.signMessage('message', opts)).resolves.toEqual({
      signedMessage: 'message-signature',
      signerAddress: 'GSCOPULY',
    });
    expect(current.signTransaction).toHaveBeenCalledWith('xdr', opts);
    expect(current.signAndSubmitTransaction).toHaveBeenCalledWith('xdr', opts);
    expect(current.signAuthEntry).toHaveBeenCalledWith('auth', opts);
    expect(current.signMessage).toHaveBeenCalledWith('message', opts);
  });

  it('preserves stable provider errors', async () => {
    installProvider(provider({
      signTransaction: vi.fn().mockRejectedValue({
        code: -4,
        message: 'User rejected.',
      }),
    }));
    const module = new ScopulyExtensionModule();

    await expect(module.signTransaction('xdr')).rejects.toEqual({
      code: -4,
      message: 'User rejected.',
    });
  });
});
