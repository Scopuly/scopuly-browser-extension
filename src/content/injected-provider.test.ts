import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {describe, expect, it, vi} from 'vitest';

type MessageEventLike = {
  source: unknown;
  data: Record<string, any>;
};

const loadProvider = () => {
  const source = fs.readFileSync('src/content/injected-provider.ts', 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const messageListeners: Array<(event: MessageEventLike) => void> = [];
  const messages: Array<Record<string, any>> = [];
  const dispatchedEvents: Array<{type: string; detail: unknown}> = [];
  const responseFor = (method: string) => {
    if (method === 'isConnected') return {isConnected: false};
    if (method === 'requestAccess') return {address: 'GSCOPULY'};
    if (method === 'getPublicKey') return {publicKey: 'GSCOPULY'};
    if (method === 'getNetwork') {
      return {
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      };
    }
    if (method === 'signTransaction') {
      return {signedTxXdr: 'signed-xdr', signerAddress: 'GSCOPULY'};
    }
    if (method === 'disconnect') return {};
    return null;
  };
  const windowObject: Record<string, any> = {
    addEventListener(type: string, listener: (event: MessageEventLike) => void) {
      if (type === 'message') messageListeners.push(listener);
    },
    postMessage(message: Record<string, any>) {
      messages.push(message);
      queueMicrotask(() => {
        const response = responseFor(message.payload?.method);
        const data = response
          ? {
              target: 'scopuly-inpage',
              id: message.id,
              ok: true,
              response,
            }
          : {
              target: 'scopuly-inpage',
              id: message.id,
              ok: false,
              error: {code: -3, message: 'Unsupported method.'},
            };
        messageListeners.forEach((listener) => listener({
          source: windowObject,
          data,
        }));
      });
    },
    setTimeout,
    clearTimeout,
    dispatchEvent(event: {type: string; detail: unknown}) {
      dispatchedEvents.push(event);
      return true;
    },
  };
  class TestCustomEvent {
    type: string;
    detail: unknown;

    constructor(type: string, init: {detail?: unknown} = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  vm.runInNewContext(javascript, {
    window: windowObject,
    document: {
      title: 'Scopuly provider test',
      querySelector: () => null,
    },
    location: {
      origin: 'https://dapp.example',
      hostname: 'dapp.example',
    },
    crypto: webcrypto,
    CustomEvent: TestCustomEvent,
    Map,
    Object,
    Promise,
    TypeError,
    queueMicrotask,
    setTimeout,
    clearTimeout,
  });
  return {
    provider: windowObject.scopuly,
    windowObject,
    messages,
    dispatchedEvents,
    emit(data: Record<string, unknown>) {
      messageListeners.forEach((listener) => listener({
        source: windowObject,
        data,
      }));
    },
  };
};

describe('MAIN-world injected provider', () => {
  it('publishes a frozen explicit Scopuly identity', () => {
    const harness = loadProvider();
    const descriptor = Object.getOwnPropertyDescriptor(
      harness.windowObject,
      'scopuly',
    );

    expect(harness.provider.version).toBe('0.3.0');
    expect(harness.provider.platform).toBe('extension');
    expect(harness.provider.isScopuly).toBe(true);
    expect(Object.isFrozen(harness.provider)).toBe(true);
    expect(descriptor).toMatchObject({
      configurable: false,
      writable: false,
    });
    expect(harness.windowObject.stellar.scopuly).toEqual({
      supported: true,
      platform: 'extension',
      version: '0.3.0',
    });
    expect(harness.dispatchedEvents.map((event) => event.type)).toEqual([
      'scopuly#initialized',
      'stellar#initialized',
    ]);
  });

  it('maps calls to the isolated bridge without accepting page origin fields', async () => {
    const harness = loadProvider();
    await expect(harness.provider.signTransaction('xdr', {
      networkPassphrase: 'Test SDF Network ; September 2015',
    })).resolves.toEqual({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GSCOPULY',
    });

    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]).toMatchObject({
      target: 'scopuly-content',
      payload: {
        method: 'signTransaction',
        params: {
          xdr: 'xdr',
          opts: {
            networkPassphrase: 'Test SDF Network ; September 2015',
          },
        },
      },
    });
    expect(harness.messages[0].payload).not.toHaveProperty('origin');
    expect(harness.messages[0].payload).not.toHaveProperty('href');
  });

  it('preserves stable errors and change events', async () => {
    const harness = loadProvider();
    await expect(
      harness.provider.request({method: 'unsupported'}),
    ).rejects.toEqual({
      code: -3,
      message: 'Unsupported method.',
    });

    const listener = vi.fn();
    const remove = harness.provider.onChange(listener);
    harness.emit({
      target: 'scopuly-inpage-event',
      type: 'change',
      detail: {
        address: 'GSCOPULY',
        isConnected: true,
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
        changed: ['address', 'isConnected'],
      },
    });
    expect(listener).toHaveBeenCalledOnce();
    remove();
  });
});
