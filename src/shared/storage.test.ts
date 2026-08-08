import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPendingRequestRecord,
  getPendingRequests,
  getWalletRecord,
  mutateMobileSessions,
  removeWalletRecord,
  savePendingRequestRecord
} from './storage';

const storageState: Record<string, unknown> = {};

beforeEach(() => {
  vi.useRealTimers();
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

describe('pending request retention', () => {
  it('removes expired active requests and old terminal payloads', async () => {
    const now = Date.now();
    storageState['scopuly.pendingRequests'] = [
      {
        id: 'active',
        kind: 'signMessage',
        status: 'awaitingMobile',
        origin: 'https://dapp.example',
        appName: 'dApp',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 60_000
      },
      {
        id: 'expired-active',
        kind: 'signMessage',
        status: 'awaitingMobile',
        origin: 'https://dapp.example',
        appName: 'dApp',
        createdAt: now - 60_000,
        updatedAt: now - 60_000,
        expiresAt: now - 1
      },
      {
        id: 'old-completed',
        kind: 'signMessage',
        status: 'completed',
        origin: 'https://dapp.example',
        appName: 'dApp',
        createdAt: now - 3_600_000,
        updatedAt: now - 16 * 60_000,
        expiresAt: now - 3_000_000,
        result: { signedMessage: 'sensitive-old-result' }
      }
    ];

    await expect(getPendingRequests()).resolves.toMatchObject([{ id: 'active' }]);
    expect(JSON.stringify(storageState['scopuly.pendingRequests']))
      .not.toContain('sensitive-old-result');
  });

  it('lets the request state machine observe a targeted expiry once', async () => {
    const now = Date.now();
    storageState['scopuly.pendingRequests'] = [{
      id: 'just-expired',
      kind: 'signMessage',
      status: 'awaitingMobile',
      origin: 'https://dapp.example',
      appName: 'dApp',
      createdAt: now - 60_000,
      updatedAt: now - 1_000,
      expiresAt: now - 1
    }];

    await expect(getPendingRequestRecord('just-expired')).resolves.toMatchObject({
      id: 'just-expired',
      status: 'awaitingMobile'
    });
  });

  it('preserves parallel pending-request inserts', async () => {
    const now = Date.now();
    const request = (id: string) => ({
      id,
      kind: 'signMessage' as const,
      status: 'awaitingMobile' as const,
      origin: 'https://dapp.example',
      appName: 'dApp',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 60_000
    });

    await Promise.all([
      savePendingRequestRecord(request('parallel-a')),
      savePendingRequestRecord(request('parallel-b'))
    ]);

    expect((await getPendingRequests()).map(({ id }) => id).sort())
      .toEqual(['parallel-a', 'parallel-b']);
  });

  it('merges parallel mutations for different mobile sessions', async () => {
    storageState['scopuly.mobileSessions'] = [
      { id: 'session-a', lastSeenAt: 1 },
      { id: 'session-b', lastSeenAt: 1 }
    ];

    await Promise.all([
      mutateMobileSessions((sessions) => sessions.map((session) => (
        session.id === 'session-a' ? { ...session, lastSeenAt: 2 } : session
      ))),
      mutateMobileSessions((sessions) => sessions.map((session) => (
        session.id === 'session-b' ? { ...session, lastSeenAt: 3 } : session
      )))
    ]);

    expect(storageState['scopuly.mobileSessions']).toEqual([
      expect.objectContaining({ id: 'session-a', lastSeenAt: 2 }),
      expect.objectContaining({ id: 'session-b', lastSeenAt: 3 })
    ]);
  });

  it('permanently removes the unused legacy wallet record', async () => {
    storageState['scopuly.wallet'] = { id: 'legacy-wallet' };
    await removeWalletRecord();
    await expect(getWalletRecord()).resolves.toBeNull();
  });
});
