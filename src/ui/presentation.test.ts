import { describe, expect, it } from 'vitest';
import {
  bridgeHealthPresentation,
  formatRelativeTime,
  groupAccountsBySession,
  requestNetwork,
  riskPresentation
} from './presentation';
import { NETWORKS, type MobileAccount, type MobileSession, type PendingRequest } from '../shared/types';

describe('UI presentation models', () => {
  it('does not describe bridge health as phone presence', () => {
    const healthy = bridgeHealthPresentation('healthy');
    expect(healthy.title).toBe('Secure session ready');
    expect(`${healthy.title} ${healthy.description}`).not.toMatch(/phone online/i);

    expect(bridgeHealthPresentation('unreachable')).toMatchObject({ tone: 'warning' });
    expect(bridgeHealthPresentation('reconnect-required')).toMatchObject({ tone: 'danger' });
    expect(bridgeHealthPresentation('incompatible').title).toMatch(/update required/i);
  });

  it('derives the request network from the request rather than global state', () => {
    const request = {
      networkPassphrase: NETWORKS.testnet.passphrase
    } as PendingRequest;
    expect(requestNetwork(request)).toBe('testnet');
  });

  it('keeps low-risk language scoped to local checks', () => {
    expect(riskPresentation('low').label).toBe('No local warnings');
    expect(riskPresentation('critical')).toMatchObject({ tone: 'danger' });
  });

  it('groups accounts by the session that disconnects them', () => {
    const now = Date.now();
    const sessions = [
      { id: 'session-a', lastSeenAt: now },
      { id: 'session-b', lastSeenAt: now }
    ] as MobileSession[];
    const accounts = [
      { id: 'a-1', sessionId: 'session-a' },
      { id: 'a-2', sessionId: 'session-a' },
      { id: 'b-1', sessionId: 'session-b' }
    ] as MobileAccount[];
    expect(groupAccountsBySession(accounts, sessions).map((group) => group.accounts.length))
      .toEqual([2, 1]);
  });

  it('formats recent activity compactly', () => {
    const now = 1_800_000;
    expect(formatRelativeTime(now - 15_000, now)).toBe('Just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe('3h ago');
  });
});
