import type { DappPolicy, OriginConnection, OriginRisk, RiskLevel } from './types';

function rank(level: RiskLevel) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[level];
}

function maxRisk(current: RiskLevel, next: RiskLevel): RiskLevel {
  return rank(next) > rank(current) ? next : current;
}

export function analyzeOrigin(origin: string, connections: OriginConnection[] = [], policies: DappPolicy[] = []): OriginRisk {
  const reasons: string[] = [];
  let hostname = origin || 'unknown';
  let secure = false;
  let local = false;
  let level: RiskLevel = 'low';

  try {
    const parsed = new URL(origin);
    hostname = parsed.hostname;
    secure = parsed.protocol === 'https:';
    local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);

    if (!secure && !local) {
      level = maxRisk(level, 'high');
      reasons.push('This site is not using HTTPS.');
    }

    if (local) {
      level = maxRisk(level, 'medium');
      reasons.push('Local development origin.');
    }

    if (parsed.hostname.includes('xn--')) {
      level = maxRisk(level, 'high');
      reasons.push('The domain contains punycode characters.');
    }
  } catch (_error) {
    level = 'critical';
    reasons.push('The request origin could not be parsed.');
  }

  const known = connections.some((connection) => connection.origin === origin);
  const policy = policies.find((item) => item.origin === origin)?.status;
  if (policy === 'blocked') {
    level = 'critical';
    reasons.push('Blocked by your Scopuly policy.');
  }
  if (policy === 'trusted') {
    reasons.push('Trusted by your Scopuly policy.');
  }
  if (!known && policy !== 'trusted') {
    level = maxRisk(level, 'medium');
    reasons.push('First connection from this website.');
  }

  if (!reasons.length) {
    reasons.push('Known HTTPS origin.');
  }

  return { level, hostname, secure, local, known, policy, reasons };
}
