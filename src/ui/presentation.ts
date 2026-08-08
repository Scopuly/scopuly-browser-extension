import {
  NETWORKS,
  type BridgeHealthStatus,
  type MobileAccount,
  type MobileSession,
  type NetworkId,
  type PendingRequest,
  type RiskLevel
} from '../shared/types';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export type StatusPresentation = {
  title: string;
  description: string;
  label: string;
  tone: StatusTone;
  icon: 'radio' | 'refresh' | 'offline' | 'warning';
};

export function bridgeHealthPresentation(status: BridgeHealthStatus): StatusPresentation {
  switch (status) {
    case 'healthy':
      return {
        title: 'Secure session ready',
        description: 'Requests are delivered to your paired Scopuly Mobile.',
        label: 'Verified session',
        tone: 'success',
        icon: 'radio'
      };
    case 'unreachable':
      return {
        title: 'Bridge temporarily unavailable',
        description: 'Your encrypted session is preserved. Scopuly will retry automatically.',
        label: 'Reconnecting',
        tone: 'warning',
        icon: 'offline'
      };
    case 'reconnect-required':
      return {
        title: 'Reconnect Scopuly Mobile',
        description: 'This mobile session can no longer be authenticated.',
        label: 'Action required',
        tone: 'danger',
        icon: 'warning'
      };
    case 'incompatible':
      return {
        title: 'Bridge update required',
        description: 'The extension and mobile bridge are using incompatible protocol versions.',
        label: 'Update required',
        tone: 'danger',
        icon: 'warning'
      };
    default:
      return {
        title: 'Checking secure session',
        description: 'Confirming that the encrypted mobile channel is available.',
        label: 'Checking',
        tone: 'neutral',
        icon: 'refresh'
      };
  }
}

export function requestTitle(request: PendingRequest) {
  if (request.kind === 'connect') return 'Account access request';
  if (request.kind === 'signMessage') return 'Message signature request';
  if (request.kind === 'signAuthEntry') return 'Soroban authorization request';
  if (request.submit) return 'Sign and submit request';
  return 'Transaction signature request';
}

export function requestNetwork(request: PendingRequest): NetworkId | undefined {
  const passphrase = request.networkPassphrase || request.review?.networkPassphrase;
  return (Object.keys(NETWORKS) as NetworkId[])
    .find((networkId) => NETWORKS[networkId].passphrase === passphrase);
}

export function riskPresentation(risk: RiskLevel) {
  if (risk === 'critical') return { label: 'Critical warning', tone: 'danger' as const };
  if (risk === 'high') return { label: 'High risk', tone: 'danger' as const };
  if (risk === 'medium') return { label: 'Review details', tone: 'warning' as const };
  return { label: 'No local warnings', tone: 'neutral' as const };
}

export function groupAccountsBySession(
  accounts: MobileAccount[],
  sessions: MobileSession[]
) {
  return sessions.map((session) => ({
    session,
    accounts: accounts.filter((account) => account.sessionId === session.id)
  })).filter((group) => group.accounts.length > 0);
}

export function formatRelativeTime(timestamp: number, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(timestamp);
}
