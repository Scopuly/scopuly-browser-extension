import * as StellarSdk from '@stellar/stellar-sdk';
import { highestRisk, shortAddress } from './format';
import type { OperationReview, RiskLevel, TransactionReview } from './types';

const riskByOperation: Record<string, RiskLevel> = {
  accountMerge: 'critical',
  setOptions: 'high',
  clawback: 'critical',
  clawbackClaimableBalance: 'critical',
  allowTrust: 'high',
  changeTrust: 'medium',
  manageData: 'medium',
  invokeHostFunction: 'high',
  extendFootprintTtl: 'medium',
  restoreFootprint: 'medium',
  beginSponsoringFutureReserves: 'medium',
  revokeSponsorship: 'medium',
  payment: 'low',
  pathPaymentStrictSend: 'medium',
  pathPaymentStrictReceive: 'medium',
  manageSellOffer: 'medium',
  manageBuyOffer: 'medium',
  createPassiveSellOffer: 'medium',
  liquidityPoolDeposit: 'medium',
  liquidityPoolWithdraw: 'medium',
  createAccount: 'low',
  claimClaimableBalance: 'low'
};

function assetLabel(asset: any) {
  if (!asset) return '';
  if (asset.isNative?.()) return 'XLM';
  const code = asset.code || asset.assetCode || asset.getCode?.();
  const issuer = asset.issuer || asset.assetIssuer || asset.getIssuer?.();
  return issuer ? `${code}:${shortAddress(issuer, 4)}` : code || String(asset);
}

function opType(operation: any) {
  return operation.type || 'operation';
}

function operationTitle(type: string) {
  return type
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .replace('Path Payment Strict', 'Path Payment');
}

function operationDescription(type: string, operation: any) {
  switch (type) {
    case 'payment':
      return `Send ${operation.amount || ''} ${assetLabel(operation.asset)} to ${shortAddress(operation.destination)}`;
    case 'pathPaymentStrictSend':
      return `Path payment sending ${operation.sendAmount || ''} ${assetLabel(operation.sendAsset)} to ${shortAddress(operation.destination)}`;
    case 'pathPaymentStrictReceive':
      return `Path payment receiving ${operation.destAmount || ''} ${assetLabel(operation.destAsset)} by ${shortAddress(operation.destination)}`;
    case 'createAccount':
      return `Create ${shortAddress(operation.destination)} with ${operation.startingBalance || '0'} XLM`;
    case 'changeTrust':
      return `Change trustline for ${assetLabel(operation.line)} with limit ${operation.limit || 'default'}`;
    case 'setOptions':
      return 'Change account options, signers, thresholds, flags, or home domain.';
    case 'accountMerge':
      return `Merge account into ${shortAddress(operation.destination)}`;
    case 'manageSellOffer':
    case 'manageBuyOffer':
    case 'createPassiveSellOffer':
      return `DEX offer ${assetLabel(operation.selling)} / ${assetLabel(operation.buying)} at ${operation.price || 'market price'}`;
    case 'liquidityPoolDeposit':
      return `Deposit into liquidity pool ${operation.liquidityPoolId ? shortAddress(operation.liquidityPoolId, 6) : ''}`;
    case 'liquidityPoolWithdraw':
      return `Withdraw from liquidity pool ${operation.liquidityPoolId ? shortAddress(operation.liquidityPoolId, 6) : ''}`;
    case 'invokeHostFunction':
      return 'Invoke a Soroban smart contract. Review source, network, and contract payload carefully.';
    default:
      return `${operationTitle(type)} operation`;
  }
}

function memoLabel(tx: any) {
  const memo = tx.memo;
  if (!memo || memo.type === 'none') return 'None';
  if (memo.type === 'text') return memo.value?.toString?.('utf8') || String(memo.value || 'Text memo');
  if (memo.type === 'id') return String(memo.value || 'ID memo');
  if (memo.value?.toString) return `${memo.type}: ${memo.value.toString('hex')}`;
  return memo.type || 'Memo';
}

function timeBoundsLabel(tx: any) {
  const bounds = tx.timeBounds || tx._timeBounds;
  if (!bounds) return 'No time bounds';
  const min = Number(bounds.minTime || 0);
  const max = Number(bounds.maxTime || 0);
  if (!min && !max) return 'No time bounds';
  const minText = min ? new Date(min * 1000).toLocaleString() : 'anytime';
  const maxText = max ? new Date(max * 1000).toLocaleString() : 'never expires';
  return `${minText} - ${maxText}`;
}

export function reviewTransactionXdr(xdr: string, networkPassphrase: string): TransactionReview {
  try {
    const envelope = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
    const feeBump = envelope instanceof StellarSdk.FeeBumpTransaction;
    const tx = feeBump ? envelope.innerTransaction : envelope;
    const operations: OperationReview[] = tx.operations.map((operation: any, index: number) => {
      const type = opType(operation);
      return {
        index,
        type,
        title: operationTitle(type),
        description: operationDescription(type, operation),
        risk: riskByOperation[type] || 'medium',
        asset: assetLabel(operation.asset || operation.line || operation.selling || operation.sendAsset),
        amount: operation.amount || operation.sendAmount || operation.destAmount,
        destination: operation.destination,
        source: operation.source
      };
    });

    const warnings: string[] = [];
    const maxTime = Number((tx.timeBounds || (tx as any)._timeBounds)?.maxTime || 0);
    if (!maxTime) warnings.push('This transaction has no expiration time.');
    if (maxTime && Math.floor(Date.now() / 1000) > maxTime) warnings.push('This transaction is already expired.');
    if (feeBump) {
      warnings.push('This is a fee-bump transaction. Verify both the fee payer and the inner transaction.');
    }
    const fee = BigInt(envelope.fee);
    const operationCount = BigInt(Math.max(1, operations.length + (feeBump ? 1 : 0)));
    if (fee / operationCount > 100_000n) {
      warnings.push('The transaction fee is unusually high for its operation count.');
    }
    if (operations.some((operation) => operation.risk === 'critical')) warnings.push('This request contains a critical account-level operation.');
    if (operations.some((operation) => operation.type === 'invokeHostFunction')) warnings.push('Soroban contract payloads can be complex. Only sign trusted dApps.');

    return {
      ok: true,
      xdr,
      networkPassphrase,
      hash: envelope.hash().toString('hex'),
      source: tx.source,
      feeBump,
      feeSource: feeBump ? envelope.feeSource : undefined,
      fee: envelope.fee,
      sequence: tx.sequence,
      memo: memoLabel(tx),
      timeBounds: timeBoundsLabel(tx),
      risk: warnings.some((warning) => warning.includes('unusually high'))
        ? highestRisk([...operations, { risk: 'high' } as OperationReview])
        : highestRisk(operations),
      warnings,
      operations
    };
  } catch (error) {
    return {
      ok: false,
      xdr,
      networkPassphrase,
      risk: 'critical',
      warnings: [],
      operations: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function verifySignedTransactionXdr(
  originalXdr: string,
  signedXdr: string,
  networkPassphrase: string,
  expectedSigner: string
) {
  const original = StellarSdk.TransactionBuilder.fromXDR(originalXdr, networkPassphrase);
  const signed = StellarSdk.TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const originalHash = original.hash();
  const signedHash = signed.hash();

  if (!originalHash.equals(signedHash)) {
    throw new Error('The signer response changed the transaction payload.');
  }

  const originalIsFeeBump = original instanceof StellarSdk.FeeBumpTransaction;
  const signedIsFeeBump = signed instanceof StellarSdk.FeeBumpTransaction;
  if (originalIsFeeBump !== signedIsFeeBump) {
    throw new Error('The signer response changed the transaction envelope type.');
  }

  const signatureKey = (signature: StellarSdk.xdr.DecoratedSignature) => (
    signature.toXDR('base64')
  );
  const signatureGroups = (
    transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction
  ) => {
    const groups = [{ signatures: transaction.signatures, hash: transaction.hash() }];
    if (transaction instanceof StellarSdk.FeeBumpTransaction) {
      groups.push({
        signatures: transaction.innerTransaction.signatures,
        hash: transaction.innerTransaction.hash()
      });
    }
    return groups;
  };
  const originalGroups = signatureGroups(original);
  const signedGroups = signatureGroups(signed);
  const added: Array<{ signature: StellarSdk.xdr.DecoratedSignature; hash: Buffer }> = [];

  for (let index = 0; index < originalGroups.length; index += 1) {
    const expectedCounts = new Map<string, number>();
    for (const signature of originalGroups[index].signatures) {
      const key = signatureKey(signature);
      expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1);
    }
    for (const signature of signedGroups[index].signatures) {
      const key = signatureKey(signature);
      const remaining = expectedCounts.get(key) || 0;
      if (remaining > 0) {
        expectedCounts.set(key, remaining - 1);
      } else {
        added.push({ signature, hash: signedGroups[index].hash });
      }
    }
    if ([...expectedCounts.values()].some((count) => count > 0)) {
      throw new Error('The signer response removed or replaced an existing transaction signature.');
    }
  }

  if (added.length !== 1) {
    throw new Error('The signer response must add exactly one transaction signature.');
  }
  const keypair = StellarSdk.Keypair.fromPublicKey(expectedSigner);
  if (!keypair.verify(added[0].hash, added[0].signature.signature())) {
    throw new Error('The signer response is not signed by the connected account.');
  }

  return {
    signedTxXdr: signed.toEnvelope().toXDR('base64'),
    signerAddress: expectedSigner,
    hash: signedHash.toString('hex')
  };
}
