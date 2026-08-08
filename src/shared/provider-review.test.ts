import * as StellarSdk from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';
import {
  normalizeX402Receipt,
  reviewAuthEntry,
  reviewMessage,
  verifySignedAuthEntry,
  verifySignedMessage
} from './provider-review';

function authPreimage(signer: StellarSdk.Keypair, networkPassphrase: string) {
  const invocation = new StellarSdk.xdr.SorobanAuthorizedInvocation({
    function: StellarSdk.xdr.SorobanAuthorizedFunction
      .sorobanAuthorizedFunctionTypeContractFn(
        new StellarSdk.xdr.InvokeContractArgs({
          contractAddress: new StellarSdk.Address(
            StellarSdk.Keypair.random().publicKey()
          ).toScAddress(),
          functionName: 'transfer',
          args: []
        })
      ),
    subInvocations: []
  });

  return StellarSdk.xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(
    new StellarSdk.xdr.HashIdPreimageSorobanAuthorizationWithAddress({
      networkId: StellarSdk.hash(Buffer.from(networkPassphrase, 'utf8')),
      nonce: StellarSdk.Hyper.fromString('42'),
      invocation,
      address: new StellarSdk.Address(signer.publicKey()).toScAddress(),
      signatureExpirationLedger: 123456
    })
  );
}

describe('mobile provider result verification', () => {
  it('reviews and verifies a SEP-53 message signature', () => {
    const signer = StellarSdk.Keypair.random();
    const message = 'Approve order #42';
    const review = reviewMessage(message);
    const signature = signer.signMessage(message).toString('hex');

    expect(review.byteLength).toBe(Buffer.byteLength(message));
    expect(review.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySignedMessage(message, signature, signer.publicKey())).toEqual({
      signedMessage: signature,
      signerAddress: signer.publicKey()
    });
  });

  it('rejects message signatures from a different account', () => {
    const signer = StellarSdk.Keypair.random();
    const impostor = StellarSdk.Keypair.random();
    const signature = impostor.signMessage('hello').toString('hex');

    expect(() => verifySignedMessage('hello', signature, signer.publicKey()))
      .toThrow('does not match the connected account');
  });

  it('warns when invisible message bytes can affect the signature', () => {
    const review = reviewMessage(' value \u0001');
    expect(review.warnings).toHaveLength(2);
  });

  it('reviews and verifies an address-bound Soroban authorization', () => {
    const signer = StellarSdk.Keypair.random();
    const preimage = authPreimage(signer, StellarSdk.Networks.TESTNET);
    const authEntry = preimage.toXDR('base64');
    const signature = signer.sign(StellarSdk.hash(preimage.toXDR())).toString('base64');
    const review = reviewAuthEntry(
      authEntry,
      StellarSdk.Networks.TESTNET,
      signer.publicKey()
    );

    expect(review.boundAddress).toBe(signer.publicKey());
    expect(review.invocation).toMatchObject({
      type: 'sorobanAuthorizedFunctionTypeContractFn',
      functionName: 'transfer',
      subInvocationsCount: 0
    });
    expect(verifySignedAuthEntry(authEntry, signature, signer.publicKey())).toEqual({
      signedAuthEntry: signature,
      signerAddress: signer.publicKey()
    });
  });

  it('rejects Soroban authorization network and signer mismatches', () => {
    const signer = StellarSdk.Keypair.random();
    const preimage = authPreimage(signer, StellarSdk.Networks.TESTNET);
    const authEntry = preimage.toXDR('base64');

    expect(() => reviewAuthEntry(
      authEntry,
      StellarSdk.Networks.PUBLIC,
      signer.publicKey()
    )).toThrow('different Stellar network');
    expect(() => reviewAuthEntry(
      authEntry,
      StellarSdk.Networks.TESTNET,
      StellarSdk.Keypair.random().publicKey()
    )).toThrow('bound to a different Stellar account');
  });
});

describe('x402 receipt validation', () => {
  const receiptId = '090eba2a51a51f4b1be18f5141aacd9f';

  it('normalizes the canonical Scopuly receipt endpoint', () => {
    expect(normalizeX402Receipt({ receiptId })).toEqual({
      receiptId,
      receiptUrl: `https://api.scopuly.com/x402/receipt/${receiptId}`
    });
  });

  it('rejects foreign URLs, query strings and ID mismatches', () => {
    expect(() => normalizeX402Receipt({
      receiptUrl: `https://evil.example/x402/receipt/${receiptId}`
    })).toThrow('canonical HTTPS endpoint');
    expect(() => normalizeX402Receipt({
      receiptUrl: `https://api.scopuly.com/x402/receipt/${receiptId}?redirect=1`
    })).toThrow('canonical HTTPS endpoint');
    expect(() => normalizeX402Receipt({
      receiptId,
      receiptUrl: 'https://api.scopuly.com/x402/receipt/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    })).toThrow('does not match');
  });
});
