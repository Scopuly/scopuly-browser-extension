import type { RiskLevel } from './types';

export function shortAddress(address = '', chars = 5) {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatOrigin(origin: string) {
  try {
    return new URL(origin).hostname.replace(/^www\./, '');
  } catch (_error) {
    return origin || 'Unknown dApp';
  }
}

export function riskWeight(level: string) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[level] || 1;
}

export function highestRisk<T extends { risk: RiskLevel }>(items: T[]): RiskLevel {
  const found = [...items].sort((a, b) => riskWeight(b.risk) - riskWeight(a.risk))[0];
  return found?.risk || 'low';
}
