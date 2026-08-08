import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { reviewTransactionXdr, verifySignedTransactionXdr } from './stellar-review';

function buildPayment(source: Keypair, destination: string, amount = '1') {
  return new TransactionBuilder(new Account(source.publicKey(), '1'), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount
      })
    )
    .setTimeout(300)
    .build();
}

describe('Stellar transaction review and mobile signature verification', () => {
  it('reviews a valid payment without signing it locally', () => {
    const source = Keypair.random();
    const destination = Keypair.random();
    const transaction = buildPayment(source, destination.publicKey());

    const review = reviewTransactionXdr(
      transaction.toEnvelope().toXDR('base64'),
      Networks.TESTNET
    );

    expect(review.ok).toBe(true);
    expect(review.source).toBe(source.publicKey());
    expect(review.operations[0]).toMatchObject({
      type: 'payment',
      amount: '1.0000000',
      destination: destination.publicKey()
    });
  });

  it('accepts a response signed by the paired mobile account', () => {
    const source = Keypair.random();
    const transaction = buildPayment(source, Keypair.random().publicKey());
    const originalXdr = transaction.toEnvelope().toXDR('base64');
    transaction.sign(source);

    const result = verifySignedTransactionXdr(
      originalXdr,
      transaction.toEnvelope().toXDR('base64'),
      Networks.TESTNET,
      source.publicKey()
    );

    expect(result.signerAddress).toBe(source.publicKey());
    expect(result.hash).toBe(transaction.hash().toString('hex'));
  });

  it('rejects a signature from an account other than the paired signer', () => {
    const source = Keypair.random();
    const impostor = Keypair.random();
    const transaction = buildPayment(source, Keypair.random().publicKey());
    const originalXdr = transaction.toEnvelope().toXDR('base64');
    transaction.sign(impostor);

    expect(() =>
      verifySignedTransactionXdr(
        originalXdr,
        transaction.toEnvelope().toXDR('base64'),
        Networks.TESTNET,
        source.publicKey()
      )
    ).toThrow('not signed by the connected account');
  });

  it('rejects a mobile response that changes the transaction payload', () => {
    const source = Keypair.random();
    const destination = Keypair.random().publicKey();
    const original = buildPayment(source, destination, '1');
    const changed = buildPayment(source, destination, '2');
    changed.sign(source);

    expect(() =>
      verifySignedTransactionXdr(
        original.toEnvelope().toXDR('base64'),
        changed.toEnvelope().toXDR('base64'),
        Networks.TESTNET,
        source.publicKey()
      )
    ).toThrow('changed the transaction payload');
  });

  it('reviews and verifies a fee-bump transaction', () => {
    const source = Keypair.random();
    const feeSource = Keypair.random();
    const inner = buildPayment(source, Keypair.random().publicKey());
    inner.sign(source);
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      feeSource,
      BASE_FEE,
      inner,
      Networks.TESTNET
    );
    const originalXdr = feeBump.toEnvelope().toXDR('base64');

    const review = reviewTransactionXdr(originalXdr, Networks.TESTNET);
    expect(review).toMatchObject({
      ok: true,
      feeBump: true,
      feeSource: feeSource.publicKey(),
      source: source.publicKey()
    });
    expect(review.warnings.join(' ')).toContain('fee-bump');

    feeBump.sign(feeSource);
    expect(verifySignedTransactionXdr(
      originalXdr,
      feeBump.toEnvelope().toXDR('base64'),
      Networks.TESTNET,
      feeSource.publicKey()
    ).hash).toBe(feeBump.hash().toString('hex'));
  });

  it('rejects a response that removes an existing signature', () => {
    const source = Keypair.random();
    const existingSigner = Keypair.random();
    const transaction = buildPayment(source, Keypair.random().publicKey());
    const unsignedXdr = transaction.toEnvelope().toXDR('base64');
    transaction.sign(existingSigner);
    const originalXdr = transaction.toEnvelope().toXDR('base64');
    const signedWithoutExisting = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
    signedWithoutExisting.sign(source);

    expect(() => verifySignedTransactionXdr(
      originalXdr,
      signedWithoutExisting.toEnvelope().toXDR('base64'),
      Networks.TESTNET,
      source.publicKey()
    )).toThrow('removed or replaced an existing transaction signature');
  });

  it('rejects unrelated signatures added alongside the connected signer', () => {
    const source = Keypair.random();
    const transaction = buildPayment(source, Keypair.random().publicKey());
    const originalXdr = transaction.toEnvelope().toXDR('base64');
    transaction.sign(source, Keypair.random());

    expect(() => verifySignedTransactionXdr(
      originalXdr,
      transaction.toEnvelope().toXDR('base64'),
      Networks.TESTNET,
      source.publicKey()
    )).toThrow('must add exactly one transaction signature');
  });
});
