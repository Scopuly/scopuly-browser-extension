import { FeeBumpTransaction, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSafeTransaction,
  loadAccountSequence,
  networkLabel,
  providerError,
  shortAddress,
  summarizeSignedTransaction
} from './helpers';

describe('developer playground helpers', () => {
  it('builds a no-value Mainnet manageData transaction', () => {
    const address = Keypair.random().publicKey();
    const xdr = buildSafeTransaction(address, '42', Networks.PUBLIC, 1_800_000_000_000);
    const transaction = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC);
    expect(transaction).not.toBeInstanceOf(FeeBumpTransaction);
    if (transaction instanceof FeeBumpTransaction) throw new Error('Unexpected fee-bump transaction.');

    expect(transaction.source).toBe(address);
    expect(transaction.sequence).toBe('43');
    expect(transaction.operations).toHaveLength(1);
    expect(transaction.operations[0].type).toBe('manageData');
    expect(summarizeSignedTransaction(xdr, Networks.PUBLIC)).toMatchObject({
      source: address,
      sequence: '43',
      operations: ['manageData'],
      signatures: 0
    });
  });

  it('loads only the requested account sequence from Horizon', async () => {
    const address = Keypair.random().publicKey();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      account_id: address,
      sequence: '123'
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(loadAccountSequence(address, Networks.PUBLIC, fetcher)).resolves.toBe('123');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('explains unfunded Mainnet and Testnet accounts', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    const address = Keypair.random().publicKey();
    await expect(loadAccountSequence(address, Networks.PUBLIC, fetcher))
      .rejects.toThrow('not funded on Stellar Mainnet');
    await expect(loadAccountSequence(address, Networks.TESTNET, fetcher))
      .rejects.toThrow('not funded on Stellar Testnet');
  });

  it('accepts only supported Stellar network passphrases', () => {
    expect(networkLabel(Networks.PUBLIC)).toBe('Mainnet');
    expect(networkLabel(Networks.TESTNET)).toBe('Testnet');
    expect(() => networkLabel('Private network')).toThrow('unsupported Stellar network');
  });

  it('formats public output and provider errors without throwing', () => {
    expect(shortAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGH')).toContain('…');
    expect(providerError({ code: -4, message: 'Rejected' })).toEqual({
      code: -4,
      message: 'Rejected'
    });
  });
});
