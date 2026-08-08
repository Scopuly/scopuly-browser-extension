import { NETWORKS, type AccountSummary, type NetworkId } from '../shared/types';

export async function loadAccountSummary(publicKey: string, networkId: NetworkId): Promise<AccountSummary> {
  const network = NETWORKS[networkId];
  try {
    const response = await fetch(`${network.horizonUrl}/accounts/${publicKey}`);
    if (response.status === 404) return { exists: false, publicKey, balances: [] };
    if (!response.ok) throw new Error(`Horizon returned ${response.status}`);
    const account = await response.json();
    return {
      exists: true,
      publicKey,
      subentryCount: account.subentry_count,
      balances: (account.balances || []).map((balance: any) => ({
        asset: balance.asset_type === 'native' ? 'XLM' : balance.asset_code,
        issuer: balance.asset_issuer,
        balance: balance.balance
      }))
    };
  } catch (error) {
    return { exists: false, publicKey, balances: [], error: error instanceof Error ? error.message : String(error) };
  }
}
