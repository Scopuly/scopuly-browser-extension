import { describe, expect, it } from 'vitest';
import fixture from '../../protocol/fixtures/bridge-v1.json';
import { parseMobileProviderResult } from './bridge-validation';
import {
  normalizeX402Receipt,
  reviewAuthEntry,
  reviewMessage,
  verifySignedAuthEntry,
  verifySignedMessage
} from './provider-review';
import {
  reviewTransactionXdr,
  verifySignedTransactionXdr
} from './stellar-review';
import type { MobileProviderResult, ProviderMethod } from './types';

describe('Scopuly Bridge provider fixtures', () => {
  it('covers and validates every advertised provider method', () => {
    const methods = Object.keys(fixture.providerPayloads) as ProviderMethod[];
    expect(methods).toEqual([
      'signTransaction',
      'signAndSubmitTransaction',
      'signMessage',
      'signAuthEntry',
      'reportX402Receipt'
    ]);

    for (const method of methods) {
      const result = parseMobileProviderResult(
        fixture.providerResults[method],
        method
      );
      expect(result.status).toBe('completed');
      expect((result as MobileProviderResult & { method: ProviderMethod }).method).toBe(method);
    }
  });

  it('keeps transaction, message, authorization and receipt fixture hashes coherent', () => {
    const transaction = fixture.providerPayloads.signTransaction;
    const transactionResult = fixture.providerResults.signTransaction;
    const review = reviewTransactionXdr(transaction.xdr, transaction.networkPassphrase);
    expect(review.hash).toBe(transaction.transactionHash);
    expect(verifySignedTransactionXdr(
      transaction.xdr,
      transactionResult.signedTxXdr,
      transaction.networkPassphrase,
      transaction.publicKey
    ).hash).toBe(transaction.transactionHash);

    const message = fixture.providerPayloads.signMessage;
    expect(reviewMessage(message.message).hash).toBe(message.messageHash);
    expect(verifySignedMessage(
      message.message,
      fixture.providerResults.signMessage.signedMessage,
      message.publicKey
    ).signerAddress).toBe(message.publicKey);

    const auth = fixture.providerPayloads.signAuthEntry;
    expect(reviewAuthEntry(
      auth.authEntry,
      auth.networkPassphrase,
      auth.publicKey
    ).fingerprint).toBe(auth.authEntryFingerprint);
    expect(verifySignedAuthEntry(
      auth.authEntry,
      fixture.providerResults.signAuthEntry.signedAuthEntry,
      auth.publicKey
    ).signerAddress).toBe(auth.publicKey);

    expect(normalizeX402Receipt(fixture.providerPayloads.reportX402Receipt)).toEqual({
      receiptId: fixture.providerPayloads.reportX402Receipt.receiptId,
      receiptUrl: fixture.providerPayloads.reportX402Receipt.receiptUrl
    });
  });
});
