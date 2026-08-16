import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  parseMobilePairingApproval,
  parseMobilePairingStatus,
  parseMobileProviderResult,
  parseMobileSignResult,
  parsePairingRelayStatus,
  parsePairingRequest
} from './bridge-validation';

const now = Date.now();

function pairing() {
  return {
    id: 'pair-1',
    uri: 'scopuly://extension/pair?id=pair-1',
    status: 'pending',
    createdAt: now,
    expiresAt: now + 60_000
  };
}

describe('Scopuly Bridge response validation', () => {
  it('accepts a bounded pairing response', () => {
    expect(parsePairingRequest(pairing())).toMatchObject({
      id: 'pair-1',
      status: 'pending'
    });
  });

  it('accepts only the Scopuly extension pairing deep link', () => {
    expect(() => parsePairingRequest({
      ...pairing(),
      uri: 'javascript:alert(1)'
    })).toThrow('Unsupported pairing URI');
    expect(() => parsePairingRequest({
      ...pairing(),
      uri: 'https://scopuly.com/extension/pair?id=pair-1'
    })).toThrow('Unsupported pairing URI');
    expect(() => parsePairingRequest({
      ...pairing(),
      uri: 'scopuly://wallet/import?id=pair-1'
    })).toThrow('Unsupported pairing URI');
    expect(() => parsePairingRequest({
      ...pairing(),
      uri: 'scopuly://extension/pair?id=another-pair'
    })).toThrow('Unsupported pairing URI');
  });

  it('binds returned accounts to the approved session', () => {
    const publicKey = Keypair.random().publicKey();
    const response = {
      pairing: { ...pairing(), status: 'approved' },
      session: {
        id: 'session-1',
        transport: 'scopuly-bridge',
        status: 'connected',
        accountIds: ['account-1'],
        capabilities: ['signTransaction'],
        createdAt: now,
        expiresAt: now + 86_400_000,
        lastSeenAt: now
      },
      accounts: [{
        id: 'account-1',
        sessionId: 'another-session',
        publicKey,
        name: 'Primary',
        supportedNetworks: ['public'],
        device: { id: 'device-1', name: 'Phone', platform: 'ios' },
        connectedAt: now,
        lastSeenAt: now
      }]
    };

    expect(() => parseMobilePairingStatus(response)).toThrow(
      'Pairing accounts do not belong to the approved session'
    );
  });

  it('requires pairing approval data to remain encrypted at the relay', () => {
    expect(parsePairingRelayStatus({
      pairing: {
        ...pairing(),
        protocolVersion: '1.0'
      }
    })).toMatchObject({ pairing: { status: 'pending' } });

    expect(() => parsePairingRelayStatus({
      pairing: {
        ...pairing(),
        status: 'approved',
        protocolVersion: '1.0'
      },
      session: {
        id: 'plaintext-session'
      },
      accounts: []
    })).toThrow('missing its encrypted approval');
  });

  it('requires the decrypted account set to exactly match the session', () => {
    const publicKey = Keypair.random().publicKey();
    expect(() => parseMobilePairingApproval({
      session: {
        id: 'session-1',
        transport: 'scopuly-bridge',
        status: 'connected',
        accountIds: ['account-1', 'hidden-account'],
        capabilities: ['signTransaction'],
        createdAt: now,
        expiresAt: now + 86_400_000,
        lastSeenAt: now,
        protocolVersion: '1.0'
      },
      accounts: [{
        id: 'account-1',
        sessionId: 'session-1',
        publicKey,
        name: 'Primary',
        supportedNetworks: ['public'],
        device: { id: 'device-1', name: 'Phone', platform: 'ios' },
        connectedAt: now,
        lastSeenAt: now,
        pairingProof: Buffer.alloc(64).toString('base64')
      }]
    })).toThrow('exactly match');
  });

  it('rejects duplicate or excessive session account identifiers', () => {
    const session = {
      id: 'session-1',
      transport: 'scopuly-bridge',
      status: 'connected',
      accountIds: ['account-1', 'account-1'],
      capabilities: ['signTransaction'],
      createdAt: now,
      expiresAt: now + 86_400_000,
      lastSeenAt: now,
      protocolVersion: '1.0'
    };
    expect(() => parseMobilePairingApproval({ session, accounts: [{}] }))
      .toThrow('Duplicate mobile session account');
    expect(() => parseMobilePairingApproval({
      session: { ...session, accountIds: Array.from({ length: 21 }, (_, index) => `account-${index}`) },
      accounts: [{}]
    })).toThrow('Invalid mobile session accounts');
  });

  it('rejects duplicate supported networks instead of silently normalizing them', () => {
    const publicKey = Keypair.random().publicKey();
    expect(() => parseMobilePairingApproval({
      session: {
        id: 'session-1',
        transport: 'scopuly-bridge',
        status: 'connected',
        accountIds: ['account-1'],
        capabilities: ['signTransaction'],
        createdAt: now,
        expiresAt: now + 86_400_000,
        lastSeenAt: now
      },
      accounts: [{
        id: 'account-1',
        sessionId: 'session-1',
        publicKey,
        name: 'Primary',
        supportedNetworks: ['public', 'public'],
        device: { id: 'device-1', name: 'Phone', platform: 'ios' },
        connectedAt: now,
        lastSeenAt: now
      }]
    })).toThrow('Duplicate Scopuly account network');
  });

  it('accepts Scopuly for Mac as a signing device', () => {
    const publicKey = Keypair.random().publicKey();
    const approval = parseMobilePairingApproval({
      session: {
        id: 'session-mac',
        transport: 'scopuly-bridge',
        status: 'connected',
        accountIds: ['account-mac'],
        capabilities: ['signTransaction', 'signAuthEntry'],
        createdAt: now,
        expiresAt: now + 86_400_000,
        lastSeenAt: now,
        protocolVersion: '1.0'
      },
      accounts: [{
        id: 'account-mac',
        sessionId: 'session-mac',
        publicKey,
        name: 'Mac Account',
        supportedNetworks: ['public'],
        device: { id: 'device-mac', name: 'Scopuly for Mac', platform: 'macos' },
        connectedAt: now,
        lastSeenAt: now
      }]
    });

    expect(approval.accounts[0].device).toMatchObject({
      name: 'Scopuly for Mac',
      platform: 'macos'
    });
  });

  it('rejects malformed signer addresses before XDR verification', () => {
    expect(() => parseMobileSignResult({
      status: 'signed',
      transportRequestId: 'request-1',
      signedTxXdr: 'AAAA',
      signerAddress: 'not-a-stellar-key'
    })).toThrow('Invalid signer address');
  });

  it('accepts bounded results for every mobile provider signing method', () => {
    const signerAddress = Keypair.random().publicKey();
    expect(parseMobileProviderResult({
      status: 'completed',
      method: 'signMessage',
      transportRequestId: 'request-message',
      signedMessage: 'ab'.repeat(64),
      signerAddress
    }, 'signMessage')).toMatchObject({
      method: 'signMessage',
      signedMessage: 'ab'.repeat(64)
    });

    expect(parseMobileProviderResult({
      status: 'completed',
      method: 'signAuthEntry',
      transportRequestId: 'request-auth',
      signedAuthEntry: Buffer.alloc(64, 1).toString('base64'),
      signerAddress
    }, 'signAuthEntry')).toMatchObject({
      method: 'signAuthEntry',
      signerAddress
    });

    expect(parseMobileProviderResult({
      status: 'completed',
      method: 'reportX402Receipt',
      transportRequestId: 'request-receipt',
      receiptId: '09'.repeat(16),
      receiptStatus: 'delivered',
      transaction: 'cd'.repeat(32)
    }, 'reportX402Receipt')).toMatchObject({
      method: 'reportX402Receipt',
      receiptStatus: 'delivered'
    });
  });

  it('rejects method substitution and incomplete submit results', () => {
    const signerAddress = Keypair.random().publicKey();
    expect(() => parseMobileProviderResult({
      status: 'completed',
      method: 'signMessage',
      transportRequestId: 'request-1',
      signedMessage: 'ab'.repeat(64),
      signerAddress
    }, 'signAuthEntry')).toThrow('different provider method');

    expect(() => parseMobileProviderResult({
      status: 'completed',
      method: 'signAndSubmitTransaction',
      transportRequestId: 'request-2',
      signedTxXdr: 'AAAA',
      signerAddress
    }, 'signAndSubmitTransaction')).toThrow('Incomplete submitted transaction');
  });
});
