/// <reference types="vite/client" />

interface Window {
  scopuly?: {
    version: string;
    __scopulyProviderVersion: string;
    isScopuly: boolean;
    platform: 'extension';
    request: (payload: { method: string; params?: Record<string, unknown> }) => Promise<unknown>;
    connect: () => Promise<unknown>;
    requestAccess: () => Promise<{ address: string }>;
    getAddress: () => Promise<unknown>;
    getPublicKey: () => Promise<string>;
    isConnected: () => Promise<unknown>;
    getNetwork: () => Promise<unknown>;
    signTransaction: (xdr: string, opts?: Record<string, unknown>) => Promise<unknown>;
    signAndSubmitTransaction: (xdr: string, opts?: Record<string, unknown>) => Promise<unknown>;
    signMessage: (message: string, opts?: Record<string, unknown>) => Promise<unknown>;
    signAuthEntry: (authEntry: string, opts?: Record<string, unknown>) => Promise<unknown>;
    reportX402Receipt: (receipt?: Record<string, unknown>) => Promise<unknown>;
    disconnect: () => Promise<void>;
    onChange: (listener: (event: unknown) => void) => () => void;
    removeListener: (listener: (event: unknown) => void) => void;
  };
  stellar?: {
    provider?: string;
    platform?: string;
    version?: string;
    scopuly?: {
      supported: boolean;
      platform: string;
      version: string;
    };
  };
}

interface ImportMetaEnv {
  readonly VITE_SCOPULY_BRIDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
