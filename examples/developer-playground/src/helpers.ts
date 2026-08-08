import {
  Account,
  BASE_FEE,
  FeeBumpTransaction,
  Networks,
  Operation,
  TransactionBuilder
} from '@stellar/stellar-sdk';

export const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const PUBLIC_HORIZON_URL = 'https://horizon.stellar.org';

type HorizonAccount = {
  account_id?: unknown;
  sequence?: unknown;
};

export function networkLabel(networkPassphrase: string) {
  if (networkPassphrase === Networks.PUBLIC) return 'Mainnet';
  if (networkPassphrase === Networks.TESTNET) return 'Testnet';
  throw new Error('The connected extension selected an unsupported Stellar network.');
}

export async function loadAccountSequence(
  address: string,
  networkPassphrase: string,
  fetcher: typeof fetch = fetch
) {
  const label = networkLabel(networkPassphrase);
  const horizonUrl = networkPassphrase === Networks.PUBLIC
    ? PUBLIC_HORIZON_URL
    : TESTNET_HORIZON_URL;
  const response = await fetcher(
    `${horizonUrl}/accounts/${encodeURIComponent(address)}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok) {
    if (response.status === 404) {
      const fundingHint = label === 'Testnet' ? ' Fund it with Friendbot first.' : '';
      throw new Error(`The connected account is not funded on Stellar ${label}.${fundingHint}`);
    }
    throw new Error(`Horizon ${label} returned HTTP ${response.status}.`);
  }

  const account = await response.json() as HorizonAccount;
  if (account.account_id !== address || typeof account.sequence !== 'string') {
    throw new Error('Horizon returned an unexpected account response.');
  }
  return account.sequence;
}

export function buildSafeTransaction(
  address: string,
  sequence: string,
  networkPassphrase: string,
  now = Date.now()
) {
  networkLabel(networkPassphrase);
  const marker = `qa-${now.toString(36)}`.slice(0, 64);
  return new TransactionBuilder(new Account(address, sequence), {
    fee: BASE_FEE,
    networkPassphrase
  })
    .addOperation(Operation.manageData({
      name: 'scopuly-playground',
      value: marker
    }))
    .setTimeout(300)
    .build()
    .toXDR();
}

export function summarizeSignedTransaction(xdr: string, networkPassphrase: string) {
  networkLabel(networkPassphrase);
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const innerTransaction = transaction instanceof FeeBumpTransaction
    ? transaction.innerTransaction
    : transaction;
  return {
    hash: transaction.hash().toString('hex'),
    source: innerTransaction.source,
    sequence: innerTransaction.sequence,
    operations: innerTransaction.operations.map((operation) => operation.type),
    signatures: transaction.signatures.length
  };
}

export function shortAddress(address: string) {
  if (address.length < 16) return address;
  return `${address.slice(0, 7)}…${address.slice(-7)}`;
}

export function providerError(error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === 'number' ? candidate.code : -1,
      message: typeof candidate.message === 'string'
        ? candidate.message
        : 'Scopuly provider request failed.'
    };
  }
  return { code: -1, message: String(error || 'Scopuly provider request failed.') };
}
