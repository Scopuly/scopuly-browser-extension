import { Keypair, Networks } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decryptBridgePayload,
  deriveBridgeEncryptionKey,
  encryptBridgePayload,
  generateBridgeKeyPair,
  pairingProofHash
} from '../shared/bridge-crypto';
import { reviewMessage, verifySignedMessage } from '../shared/provider-review';
import { getMobileSessions, saveMobileSessions } from '../shared/storage';
import type {
  MobileMessageRequest,
  MobileProviderResult,
  PairingRequest
} from '../shared/types';
import { ScopulyBridgeTransport } from './signer-transport';
import { getBridgePrivateKey } from './bridge-key-store';

const storageState: Record<string, unknown> = {};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

beforeEach(() => {
  for (const key of Object.keys(storageState)) delete storageState[key];
  globalThis.chrome = {
    runtime: {
      id: 'fixture-extension-id',
      getManifest: () => ({ version: '0.2.0' })
    },
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

describe('Scopuly Bridge transport integration', () => {
  it('normalizes a versioned bridge base URL without duplicating v1', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe(
        'https://api.scopuly.com/extension-bridge/v1/extension/pairings'
      );
      return json({
        id: 'pairing-versioned-url-1',
        uri: 'scopuly://extension/pair?id=pairing-versioned-url-1',
        status: 'pending',
        protocolVersion: '1.0',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        extensionAccessToken: 'e'.repeat(43)
      });
    }) as unknown as typeof fetch;
    const transport = new ScopulyBridgeTransport({
      bridgeUrl: 'https://api.scopuly.com/extension-bridge/v1/',
      fetchImpl: mockFetch
    });

    await expect(transport.createPairing()).resolves.toMatchObject({
      id: 'pairing-versioned-url-1'
    });
  });

  it('pairs, hides provider data from the relay, decrypts a result and rejects replay', async () => {
    const mobileChannel = await generateBridgeKeyPair();
    const signer = Keypair.random();
    const now = Date.now();
    const pairingId = 'pairing-integration-1';
    const sessionId = 'session-integration-1';
    const accountId = 'account-integration-1';
    const transportRequestId = 'transport-integration-1';
    const extensionAccessToken = 'e'.repeat(43);
    const pairingExpiresAt = now + 120_000;
    const sessionExpiresAt = now + 86_400_000;
    let extensionPublicKey = '';
    let mobileRequest: MobileMessageRequest | undefined;
    let mobileResultEnvelope: unknown;

    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (url.pathname.endsWith('/v1/extension/pairings') && init?.method === 'POST') {
        extensionPublicKey = body.extensionPublicKey;
        expect(body).toMatchObject({
          protocolVersion: '1.0',
          extensionId: 'fixture-extension-id'
        });
        return json({
          id: pairingId,
          uri: `scopuly://extension/pair?id=${pairingId}`,
          status: 'pending',
          protocolVersion: '1.0',
          createdAt: now,
          expiresAt: pairingExpiresAt,
          extensionAccessToken
        });
      }

      if (url.pathname.endsWith(`/v1/extension/pairings/${pairingId}`)) {
        expect((init?.headers as Record<string, string>)?.Authorization)
          .toBe(`Bearer ${extensionAccessToken}`);
        const pairingProofPayload = {
          pairingId,
          sessionId,
          extensionPublicKey,
          mobilePublicKey: mobileChannel.publicKey,
          accountId,
          accountPublicKey: signer.publicKey(),
          expiresAt: sessionExpiresAt
        };
        const pairingProof = signer.sign(
          pairingProofHash(pairingProofPayload)
        ).toString('base64');
        const approvalKey = await deriveBridgeEncryptionKey(
          mobileChannel.privateKey,
          extensionPublicKey,
          pairingId,
          'mobile-to-extension'
        );
        const approvalEnvelope = await encryptBridgePayload({
          session: {
            id: sessionId,
            transport: 'scopuly-bridge',
            status: 'connected',
            accountIds: [accountId],
            capabilities: [
              'signTransaction',
              'signAndSubmitTransaction',
              'signMessage',
              'signAuthEntry',
              'reportX402Receipt'
            ],
            createdAt: now,
            expiresAt: sessionExpiresAt,
            lastSeenAt: now,
            protocolVersion: '1.0'
          },
          accounts: [{
            id: accountId,
            sessionId,
            publicKey: signer.publicKey(),
            name: 'Test mobile account',
            supportedNetworks: ['testnet'],
            device: {
              id: 'device-integration-1',
              name: 'Test phone',
              platform: 'ios'
            },
            connectedAt: now,
            lastSeenAt: now,
            pairingProof
          }]
        }, approvalKey, {
          sessionId,
          requestId: pairingId,
          direction: 'mobile-to-extension',
          counter: 1,
          expiresAt: pairingExpiresAt
        });

        return json({
          pairing: {
            id: pairingId,
            uri: `scopuly://extension/pair?id=${pairingId}`,
            status: 'approved',
            protocolVersion: '1.0',
            createdAt: now,
            expiresAt: pairingExpiresAt
          },
          sessionId,
          mobilePublicKey: mobileChannel.publicKey,
          approvalEnvelope
        });
      }

      if (url.pathname.endsWith('/v1/extension/provider-requests')
        && init?.method === 'POST') {
        expect((init?.headers as Record<string, string>)?.Authorization)
          .toBe(`Bearer ${extensionAccessToken}`);
        expect(body).not.toHaveProperty('method');
        expect(body).not.toHaveProperty('message');
        const requestKey = await deriveBridgeEncryptionKey(
          mobileChannel.privateKey,
          extensionPublicKey,
          pairingId,
          'extension-to-mobile'
        );
        mobileRequest = await decryptBridgePayload<MobileMessageRequest>(
          body.envelope,
          requestKey,
          {
            direction: 'extension-to-mobile',
            sessionId,
            requestId: body.requestId,
            minimumCounter: 0
          }
        );
        const resultKey = await deriveBridgeEncryptionKey(
          mobileChannel.privateKey,
          extensionPublicKey,
          pairingId,
          'mobile-to-extension'
        );
        const result: MobileProviderResult = {
          status: 'completed',
          method: 'signMessage',
          transportRequestId,
          signedMessage: signer.signMessage(mobileRequest.message).toString('hex'),
          signerAddress: signer.publicKey()
        };
        mobileResultEnvelope = await encryptBridgePayload(result, resultKey, {
          sessionId,
          requestId: mobileRequest.requestId,
          direction: 'mobile-to-extension',
          counter: 2,
          expiresAt: mobileRequest.expiresAt
        });
        return json({
          status: 'pending',
          transportRequestId,
          push: { status: 'accepted' }
        });
      }

      if (url.pathname.endsWith(`/v1/extension/sessions/${sessionId}`)
        && (!init?.method || init.method === 'GET')) {
        return json({
          status: 'connected',
          protocolVersion: '1.0',
          sessionId,
          expiresAt: sessionExpiresAt,
          lastActivityAt: now,
          serverTime: now
        });
      }

      if (url.pathname.endsWith(
        `/v1/extension/provider-requests/${transportRequestId}`
      )) {
        return json({
          status: 'ready',
          transportRequestId,
          envelope: mobileResultEnvelope
        });
      }

      return json({ error: 'Unexpected mock bridge request.' }, 404);
    }) as unknown as typeof fetch;

    const transport = new ScopulyBridgeTransport({
      bridgeUrl: 'https://api.scopuly.com/extension-bridge',
      fetchImpl: mockFetch
    });
    const pairing = await transport.createPairing();
    expect(pairing.uri).toContain('v=1.0');
    expect(pairing.uri).toContain('epk=');

    const approved = await transport.getPairingStatus(pairing as PairingRequest);
    expect(approved.accounts?.[0].publicKey).toBe(signer.publicKey());
    expect(approved.session?.channel?.privateKeyId).toBeTruthy();
    await expect(
      getBridgePrivateKey(approved.session!.channel!.privateKeyId)
    ).resolves.toMatchObject({
      type: 'private',
      extractable: false
    });
    await saveMobileSessions([approved.session!]);
    await expect(transport.getSessionHealth(approved.session!)).resolves.toEqual(
      expect.any(Number)
    );

    const message = 'Approve integration request';
    const request: MobileMessageRequest = {
      requestId: 'request-integration-1',
      sessionId,
      accountId,
      publicKey: signer.publicKey(),
      origin: 'https://dapp.example',
      appName: 'Integration dApp',
      expiresAt: now + 60_000,
      method: 'signMessage',
      message,
      messageHash: reviewMessage(message).hash,
      networkPassphrase: Networks.TESTNET
    };
    await expect(transport.sendProviderRequest(request)).resolves.toEqual({
      status: 'pending',
      transportRequestId,
      pushStatus: 'accepted'
    });
    expect(mobileRequest).toEqual(request);

    const context = {
      transportRequestId,
      sessionId,
      requestId: request.requestId,
      expectedMethod: 'signMessage' as const
    };
    const result = await transport.getProviderRequestStatus(context);
    expect(result.status).toBe('completed');
    if (result.status === 'completed' && result.method === 'signMessage') {
      expect(verifySignedMessage(
        message,
        result.signedMessage,
        signer.publicKey()
      ).signerAddress).toBe(signer.publicKey());
    }
    expect((await getMobileSessions())[0].channel?.receivedCounters).toEqual([1, 2]);

    await expect(transport.getProviderRequestStatus(context))
      .rejects.toThrow('reused or reordered');
  });
});
