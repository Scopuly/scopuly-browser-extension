export const SCOPULY_EXTENSION_ID = 'scopuly-extension';

const SCOPULY_ICON = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="14" x2="112" y1="14" y2="116" gradientUnits="userSpaceOnUse"%3E%3Cstop stop-color="%2358E6FF"/%3E%3Cstop offset=".48" stop-color="%236E65FF"/%3E%3Cstop offset="1" stop-color="%23A7FF7A"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width="128" height="128" rx="30" fill="%23071015"/%3E%3Cpath d="M24 75c14 17 55 24 79 3 5-4 3-11-4-11H67c-9 0-14-12-7-19 12-11 35-7 45 5" fill="none" stroke="url(%23g)" stroke-width="10" stroke-linecap="round"/%3E%3Cpath d="M26 53c18-22 62-27 83-1" fill="none" stroke="url(%23g)" stroke-width="10" stroke-linecap="round" opacity=".9"/%3E%3Ccircle cx="35" cy="74" r="5" fill="%23A7FF7A"/%3E%3C/svg%3E';

const normalizeError = (error, fallback = 'Scopuly extension request failed.') => {
  if (error && typeof error === 'object') {
    const candidate = error.error && typeof error.error === 'object'
      ? error.error
      : error;
    return {
      code: typeof candidate.code === 'number' ? candidate.code : -1,
      message: typeof candidate.message === 'string' && candidate.message
        ? candidate.message
        : fallback,
    };
  }
  return {
    code: -1,
    message: typeof error === 'string' && error ? error : fallback,
  };
};

const provider = () => {
  const current = typeof window === 'undefined' ? null : window.scopuly;
  if (!current
    || current.isScopuly !== true
    || current.platform !== 'extension') {
    throw {
      code: -3,
      message: 'Scopuly Mobile Signer extension is not available.',
    };
  }
  return current;
};

const resultOrThrow = async (promise) => {
  try {
    const result = await promise;
    if (result?.error) throw result.error;
    return result;
  }
  catch (error) {
    throw normalizeError(error);
  }
};

const requireString = (value, label) => {
  if (typeof value !== 'string' || !value) {
    throw {
      code: -3,
      message: `Scopuly returned an invalid ${label}.`,
    };
  }
  return value;
};

export class ScopulyExtensionModule {
  moduleType = 'BRIDGE_WALLET';
  productId = SCOPULY_EXTENSION_ID;
  productName = 'Scopuly Mobile Signer';
  productUrl = 'https://scopuly.com';
  productIcon = SCOPULY_ICON;

  async runChecks() {
    if (!await this.isAvailable()) {
      throw {
        code: -3,
        message: 'Scopuly Mobile Signer extension is not available.',
      };
    }
  }

  async isAvailable() {
    try {
      const current = provider();
      return typeof current.requestAccess === 'function'
        && typeof current.signTransaction === 'function'
        && typeof current.signAuthEntry === 'function'
        && typeof current.signMessage === 'function';
    }
    catch (_error) {
      return false;
    }
  }

  async isPlatformWrapper() {
    return false;
  }

  onChange(callback) {
    if (typeof callback !== 'function') return;
    const current = provider();
    current.onChange((event) => {
      callback({
        address: event?.address || '',
        network: event?.network || '',
        networkPassphrase: event?.networkPassphrase || '',
      });
    });
  }

  async getAddress(params = {}) {
    await this.runChecks();
    const current = provider();
    if (params.skipRequestAccess === true) {
      const connection = await resultOrThrow(current.isConnected());
      if (connection?.isConnected !== true) {
        throw {
          code: -3,
          message: 'Request Scopuly account access before reading the address.',
        };
      }
      const result = await resultOrThrow(current.getAddress());
      return {address: requireString(result?.address, 'address')};
    }
    const result = await resultOrThrow(current.requestAccess());
    return {address: requireString(result?.address, 'address')};
  }

  async signTransaction(xdr, opts = {}) {
    await this.runChecks();
    const result = await resultOrThrow(
      provider().signTransaction(xdr, {
        networkPassphrase: opts.networkPassphrase,
        address: opts.address,
      }),
    );
    return {
      signedTxXdr: requireString(result?.signedTxXdr, 'signed transaction'),
      signerAddress: result?.signerAddress,
    };
  }

  async signAndSubmitTransaction(xdr, opts = {}) {
    await this.runChecks();
    const result = await resultOrThrow(
      provider().signAndSubmitTransaction(xdr, {
        networkPassphrase: opts.networkPassphrase,
        address: opts.address,
      }),
    );
    if (!['success', 'pending'].includes(result?.status)) {
      throw {
        code: -3,
        message: 'Scopuly returned an invalid submission status.',
      };
    }
    return {status: result.status};
  }

  async signAuthEntry(authEntry, opts = {}) {
    await this.runChecks();
    const result = await resultOrThrow(
      provider().signAuthEntry(authEntry, {
        networkPassphrase: opts.networkPassphrase,
        address: opts.address,
      }),
    );
    return {
      signedAuthEntry: requireString(result?.signedAuthEntry, 'authorization signature'),
      signerAddress: result?.signerAddress,
    };
  }

  async signMessage(message, opts = {}) {
    await this.runChecks();
    const result = await resultOrThrow(
      provider().signMessage(message, {
        networkPassphrase: opts.networkPassphrase,
        address: opts.address,
      }),
    );
    return {
      signedMessage: requireString(result?.signedMessage, 'message signature'),
      signerAddress: result?.signerAddress,
    };
  }

  async reportX402Receipt(receipt = {}) {
    await this.runChecks();
    return resultOrThrow(provider().reportX402Receipt(receipt));
  }

  async getNetwork() {
    await this.runChecks();
    const result = await resultOrThrow(provider().getNetwork());
    return {
      network: requireString(result?.network, 'network'),
      networkPassphrase: requireString(result?.networkPassphrase, 'network passphrase'),
    };
  }

  async disconnect() {
    await this.runChecks();
    await resultOrThrow(provider().disconnect());
  }
}
