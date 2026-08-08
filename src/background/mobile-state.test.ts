import { beforeEach, describe, expect, it } from 'vitest';
import {
  connectMobileOrigin,
  disconnectMobileSession,
  getMobileState,
  getOriginConnection,
  resolveConnectedMobileAccount,
  touchMobileOrigin
} from './mobile-state';
import {
  deleteBridgePrivateKey,
  getBridgePrivateKey,
  saveBridgePrivateKey
} from './bridge-key-store';
import { generateBridgeKeyPair } from '../shared/bridge-crypto';

const storageState: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of Object.keys(storageState)) delete storageState[key];
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const selected = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            selected
              .filter((key) => key in storageState)
              .map((key) => [key, storageState[key]])
          );
        },
        set: async (values: Record<string, unknown>) => {
          Object.assign(storageState, values);
        },
        remove: async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storageState[key];
        }
      }
    }
  } as unknown as typeof chrome;
});

describe('mobile state privacy boundary', () => {
  it('keeps the bridge key while an approved pairing is being finalized', async () => {
    const now = Date.now();
    const privateKeyId = crypto.randomUUID();
    const keyPair = await generateBridgeKeyPair();
    await saveBridgePrivateKey(privateKeyId, keyPair.privateKey, now + 60_000);
    storageState['scopuly.pairing'] = {
      id: 'pairing-being-finalized',
      uri: 'scopuly://extension/pair?id=pairing-being-finalized',
      status: 'approved',
      protocolVersion: '1.0',
      createdAt: now,
      expiresAt: now + 60_000,
      channel: {
        privateKeyId,
        extensionPublicKey: 'extension-public-channel-key',
        relayAccessToken: 'e'.repeat(43)
      }
    };

    const state = await getMobileState();

    expect(state.pairing).toBeUndefined();
    expect(storageState['scopuly.pairing']).toMatchObject({ status: 'approved' });
    await expect(getBridgePrivateKey(privateKeyId)).resolves.toBe(keyPair.privateKey);
    await deleteBridgePrivateKey(privateKeyId);
  });

  it('never exposes channel private keys to extension UI state', async () => {
    const now = Date.now();
    const sessionId = 'session-private-state-1';
    storageState['scopuly.mobileSessions'] = [{
      id: sessionId,
      transport: 'scopuly-bridge',
      status: 'connected',
      accountIds: ['account-private-state-1'],
      capabilities: [
        'signTransaction',
        'signAndSubmitTransaction',
        'signMessage',
        'signAuthEntry',
        'reportX402Receipt'
      ],
      createdAt: now,
      expiresAt: now + 86_400_000,
      lastSeenAt: now,
      protocolVersion: '1.0',
      mobilePublicKey: 'mobile-public-channel-key',
      channel: {
        protocolVersion: '1.0',
        pairingId: 'pairing-private-state-1',
        extensionPublicKey: 'extension-public-channel-key',
        mobilePublicKey: 'mobile-public-channel-key',
        privateKeyId: 'private-key-id-fixture',
        relayAccessToken: 'e'.repeat(43),
        sendCounter: 1,
        receivedCounters: [1]
      }
    }];
    storageState['scopuly.mobileAccounts'] = [{
      id: 'account-private-state-1',
      sessionId,
      publicKey: 'GA25WUBF5RZ4U2NTVDIW7GHTAYRNBOHFMWEOUXNF2SYNTLJ7MZQG6LY6',
      name: 'Primary',
      supportedNetworks: ['public'],
      device: { id: 'device-1', name: 'Phone', platform: 'ios' },
      connectedAt: now,
      lastSeenAt: now
    }];
    storageState['scopuly.selectedMobileAccount'] = 'account-private-state-1';
    storageState['scopuly.pairing'] = {
      id: 'pairing-private-state-1',
      uri: 'scopuly://extension/pair?id=pairing-private-state-1',
      status: 'pending',
      protocolVersion: '1.0',
      createdAt: now,
      expiresAt: now + 60_000,
      channel: {
        privateKeyId: 'pairing-private-key-id-fixture',
        extensionPublicKey: 'extension-public-channel-key',
        relayAccessToken: 'e'.repeat(43)
      }
    };

    const state = await getMobileState();
    expect(state.mobileSessions[0].channel).toBeUndefined();
    expect(state.mobileSessions[0].mobilePublicKey).toBeUndefined();
    expect(state.pairing?.channel).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain('private-key-id-fixture');
    expect(JSON.stringify(state)).not.toContain('pairing-private-key-id-fixture');
    expect(JSON.stringify(state)).not.toContain('e'.repeat(43));
  });

  it('disconnects every account in the selected mobile session only', async () => {
    const now = Date.now();
    storageState['scopuly.mobileSessions'] = [
      {
        id: 'session-a',
        transport: 'scopuly-bridge',
        status: 'connected',
        accountIds: ['account-a-1', 'account-a-2'],
        capabilities: ['signTransaction'],
        createdAt: now,
        expiresAt: now + 60_000,
        lastSeenAt: now
      },
      {
        id: 'session-b',
        transport: 'walletconnect',
        status: 'connected',
        accountIds: ['account-b-1'],
        capabilities: ['signTransaction'],
        createdAt: now,
        expiresAt: now + 60_000,
        lastSeenAt: now
      }
    ];
    storageState['scopuly.mobileAccounts'] = [
      { id: 'account-a-1', sessionId: 'session-a' },
      { id: 'account-a-2', sessionId: 'session-a' },
      { id: 'account-b-1', sessionId: 'session-b' }
    ];
    storageState['scopuly.connections'] = [
      { origin: 'https://a.example', accountId: 'account-a-1' },
      { origin: 'https://b.example', accountId: 'account-b-1' }
    ];

    await disconnectMobileSession('session-a');

    expect(storageState['scopuly.mobileSessions']).toEqual([
      expect.objectContaining({ id: 'session-b' })
    ]);
    expect(storageState['scopuly.mobileAccounts']).toEqual([
      expect.objectContaining({ id: 'account-b-1' })
    ]);
    expect(storageState['scopuly.connections']).toEqual([
      expect.objectContaining({ origin: 'https://b.example' })
    ]);
  });

  it('updates local dApp activity without changing its permission data', async () => {
    storageState['scopuly.connections'] = [{
      origin: 'https://app.example.com',
      name: 'Example',
      accountId: 'account-1',
      publicKey: 'GABC',
      connectedAt: 100,
      lastUsedAt: 100
    }];

    await touchMobileOrigin('https://app.example.com');
    const connection = await getOriginConnection('https://app.example.com');

    expect(connection).toMatchObject({
      origin: 'https://app.example.com',
      accountId: 'account-1',
      publicKey: 'GABC',
      connectedAt: 100
    });
    expect(connection!.lastUsedAt).toBeGreaterThan(100);
  });

  it('requires both account ID and public key to match a stored connection', () => {
    const account = {
      id: 'account-1',
      sessionId: 'session-1',
      publicKey: 'GNEW',
      name: 'Primary',
      supportedNetworks: ['public'] as ['public'],
      device: { id: 'device-1', name: 'Phone' },
      connectedAt: 1,
      lastSeenAt: 1
    };
    expect(resolveConnectedMobileAccount({
      origin: 'https://app.example',
      name: 'App',
      accountId: account.id,
      publicKey: 'GOLD',
      connectedAt: 1,
      lastUsedAt: 1
    }, [account])).toBeUndefined();
  });

  it('does not silently fall back when a requested account disappeared', async () => {
    const now = Date.now();
    storageState['scopuly.mobileSessions'] = [{
      id: 'session-1',
      transport: 'walletconnect',
      status: 'connected',
      accountIds: ['account-1'],
      capabilities: ['signTransaction'],
      createdAt: now,
      expiresAt: now + 60_000,
      lastSeenAt: now
    }];
    storageState['scopuly.mobileAccounts'] = [{
      id: 'account-1',
      sessionId: 'session-1',
      publicKey: 'GACTIVE',
      name: 'Active',
      supportedNetworks: ['public'],
      device: { id: 'device-1', name: 'Phone' },
      connectedAt: now,
      lastSeenAt: now
    }];
    storageState['scopuly.selectedMobileAccount'] = 'account-1';

    await expect(connectMobileOrigin(
      'https://app.example',
      'App',
      undefined,
      'removed-account'
    )).rejects.toThrow('no longer available');
    expect(storageState['scopuly.connections']).toBeUndefined();
  });
});
