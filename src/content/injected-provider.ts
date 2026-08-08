(() => {
const SCOPULY_PROVIDER_VERSION = '0.3.0';
const SCOPULY_PROVIDER_ERROR = {
  INTERNAL: -1,
  INVALID_REQUEST: -3
} as const;

type ScopulyProviderError = {
  code: number;
  message: string;
};

type ProviderRequest = {
  method: string;
  params?: Record<string, unknown>;
};

type InpageProviderChange = {
  address: string;
  isConnected: boolean;
  network: string;
  networkPassphrase: string;
  changed: Array<'address' | 'isConnected' | 'network' | 'networkPassphrase'>;
};

type ChangeListener = (event: InpageProviderChange) => void;

const pending = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: ScopulyProviderError) => void;
  timer: number;
}>();
let changeListeners: ChangeListener[] = [];

function providerError(value: unknown): ScopulyProviderError {
  if (value && typeof value === 'object') {
    const candidate = value as { code?: unknown; message?: unknown };
    if (typeof candidate.code === 'number' && typeof candidate.message === 'string') {
      return { code: candidate.code, message: candidate.message };
    }
  }

  return {
    code: SCOPULY_PROVIDER_ERROR.INTERNAL,
    message: typeof value === 'string' && value ? value : 'Scopuly provider request failed.'
  };
}

function request({ method, params = {} }: ProviderRequest): Promise<any> {
  const id = crypto.randomUUID();
  const appName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')
    || document.title
    || location.hostname;
  const icon = document.querySelector('link[rel~="icon"]')?.getAttribute('href') || '';

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject({
        code: SCOPULY_PROVIDER_ERROR.INVALID_REQUEST,
        message: 'Scopuly provider request timed out.'
      });
    }, 5 * 60 * 1000);
    pending.set(id, { resolve, reject, timer });
    window.postMessage({
      target: 'scopuly-content',
      id,
      payload: { method, params, appName, icon }
    }, location.origin);
  });
}

function emitChange(event: InpageProviderChange) {
  changeListeners.slice().forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      window.setTimeout(() => {
        throw error;
      }, 0);
    }
  });
  window.dispatchEvent(new CustomEvent('scopuly#change', { detail: event }));
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.target === 'scopuly-inpage-event' && event.data?.type === 'change') {
    emitChange(event.data.detail as InpageProviderChange);
    return;
  }

  if (event.data?.target !== 'scopuly-inpage') return;
  const handler = pending.get(event.data.id);
  if (!handler) return;
  pending.delete(event.data.id);
  window.clearTimeout(handler.timer);
  if (event.data.ok) handler.resolve(event.data.response);
  else handler.reject(providerError(event.data.error));
});

const scopuly = {
  version: SCOPULY_PROVIDER_VERSION,
  __scopulyProviderVersion: SCOPULY_PROVIDER_VERSION,
  isScopuly: true,
  platform: 'extension',
  request,
  connect: () => request({ method: 'requestAccess' }),
  requestAccess: () => request({ method: 'requestAccess' }),
  getAddress: () => request({ method: 'getAddress' }),
  getPublicKey: () => request({ method: 'getPublicKey' }).then((result) => (
    result?.publicKey || result?.address || result
  )),
  isConnected: () => request({ method: 'isConnected' }),
  getNetwork: () => request({ method: 'getNetwork' }),
  signTransaction: (xdr: string, opts: Record<string, unknown> = {}) => (
    request({ method: 'signTransaction', params: { xdr, opts } })
  ),
  signAndSubmitTransaction: (xdr: string, opts: Record<string, unknown> = {}) => (
    request({ method: 'signAndSubmitTransaction', params: { xdr, opts } })
  ),
  signMessage: (message: string, opts: Record<string, unknown> = {}) => (
    request({ method: 'signMessage', params: { message, opts } })
  ),
  signAuthEntry: (authEntry: string, opts: Record<string, unknown> = {}) => (
    request({ method: 'signAuthEntry', params: { authEntry, opts } })
  ),
  reportX402Receipt: (receipt: Record<string, unknown> = {}) => (
    request({ method: 'reportX402Receipt', params: receipt })
  ),
  disconnect: () => request({ method: 'disconnect' }).then(() => undefined),
  onChange: (listener: ChangeListener) => {
    if (typeof listener !== 'function') {
      throw new TypeError('Scopuly provider onChange listener must be a function.');
    }
    if (!changeListeners.includes(listener)) changeListeners.push(listener);
    return () => scopuly.removeListener(listener);
  },
  removeListener: (listener: ChangeListener) => {
    changeListeners = changeListeners.filter((entry) => entry !== listener);
  }
};

Object.freeze(scopuly);
Object.defineProperty(window, 'scopuly', {
  value: scopuly,
  configurable: false,
  writable: false
});

try {
  const target = window as typeof window & {
    stellar?: {
      provider?: string;
      platform?: string;
      version?: string;
      scopuly?: { supported: boolean; platform: string; version: string };
    };
  };
  target.stellar ||= {};
  target.stellar.scopuly = {
    supported: true,
    platform: 'extension',
    version: SCOPULY_PROVIDER_VERSION
  };
  target.stellar.provider ||= 'scopuly';
  target.stellar.platform ||= 'extension';
  target.stellar.version ||= SCOPULY_PROVIDER_VERSION;
} catch (_error) {
  // Another provider may expose a non-writable compatibility namespace.
}

window.dispatchEvent(new CustomEvent('scopuly#initialized', {
  detail: { version: SCOPULY_PROVIDER_VERSION, platform: 'extension' }
}));
window.dispatchEvent(new CustomEvent('stellar#initialized', {
  detail: {
    provider: 'scopuly',
    platform: 'extension',
    version: SCOPULY_PROVIDER_VERSION
  }
}));
})();
