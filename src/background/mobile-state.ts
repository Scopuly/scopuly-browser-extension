import {
  getConnections,
  getBridgeHealth,
  getDappPolicies,
  getMobileAccounts,
  getMobileSessions,
  getPairingRequest,
  getSelectedMobileAccountId,
  getSettings,
  getWalletRecord,
  mutateConnections,
  mutateMobileAccounts,
  mutateMobileSessions,
  removeConnection,
  saveBridgeHealth,
  savePairingRequest,
  saveSelectedMobileAccountId,
  saveSettings,
  upsertConnection
} from '../shared/storage';
import {
  type BridgeHealth,
  NETWORKS,
  type MobileAccount,
  type MobileSession,
  type NetworkId,
  type OriginConnection,
  type PairingRequest,
  type ThemeMode,
  type WalletState
} from '../shared/types';
import {
  BridgeTransportError,
  mobileSignerTransport
} from './signer-transport';
import {
  deleteBridgePrivateKey,
  isBridgePrivateKeyUnavailableError
} from './bridge-key-store';

let pairingQueue: Promise<void> = Promise.resolve();

async function inPairingQueue<T>(task: () => Promise<T>) {
  const previous = pairingQueue;
  let release: () => void = () => undefined;
  pairingQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

function liveSessions(sessions: MobileSession[]) {
  const now = Date.now();
  return sessions.filter((session) => (
    session.status === 'connected'
    && session.expiresAt > now
    && Array.isArray(session.capabilities)
    && session.capabilities.length > 0
    && (session.transport !== 'scopuly-bridge'
      || (
        session.protocolVersion === '1.0'
        && typeof session.channel?.privateKeyId === 'string'
        && Boolean(session.channel.privateKeyId)
      ))
  ));
}

function accountIsLive(account: MobileAccount, sessionIds: Set<string>) {
  return sessionIds.has(account.sessionId);
}

export function resolveConnectedMobileAccount(
  connection: OriginConnection | null | undefined,
  accounts: MobileAccount[]
) {
  if (!connection?.accountId || !connection.publicKey) return undefined;
  return accounts.find((account) => (
    account.id === connection.accountId && account.publicKey === connection.publicKey
  ));
}

function publicPairing(pairing: PairingRequest | undefined) {
  if (!pairing) return undefined;
  const {
    channel: _channel,
    relayAccessToken: _relayAccessToken,
    ...safePairing
  } = pairing;
  return safePairing;
}

function publicSession(session: MobileSession) {
  const {
    channel: _channel,
    mobilePublicKey: _mobilePublicKey,
    ...safeSession
  } = session;
  return safeSession;
}

export async function getMobileState(): Promise<WalletState> {
  const [
    settings,
    connections,
    policies,
    storedAccounts,
    storedSessions,
    selectedAccountId,
    pairing,
    bridgeHealth,
    legacyWallet
  ] = await Promise.all([
    getSettings(),
    getConnections(),
    getDappPolicies(),
    getMobileAccounts(),
    getMobileSessions(),
    getSelectedMobileAccountId(),
    getPairingRequest(),
    getBridgeHealth(),
    getWalletRecord()
  ]);

  let sessions = liveSessions(storedSessions);
  if (sessions.length !== storedSessions.length) {
    sessions = await mutateMobileSessions((current) => liveSessions(current));
  }
  const sessionIds = new Set(sessions.map((session) => session.id));
  let accounts = storedAccounts.filter((account) => accountIsLive(account, sessionIds));
  if (accounts.length !== storedAccounts.length) {
    accounts = await mutateMobileAccounts((current) => current.filter((account) => (
      accountIsLive(account, sessionIds)
    )));
  }
  const liveAccountKeys = new Map(accounts.map((account) => [account.id, account.publicKey]));
  let validConnections = connections.filter((connection) => (
    !connection.accountId || liveAccountKeys.get(connection.accountId) === connection.publicKey
  ));
  if (validConnections.length !== connections.length) {
    validConnections = await mutateConnections((current) => current.filter((connection) => (
      !connection.accountId || liveAccountKeys.get(connection.accountId) === connection.publicKey
    )));
  }
  const selected = accounts.find((account) => account.id === selectedAccountId) || accounts[0];
  const retainedPairing = pairing
    && pairing.expiresAt > Date.now()
    && ['pending', 'approved'].includes(pairing.status)
    && typeof pairing.channel?.privateKeyId === 'string'
    && Boolean(pairing.channel.privateKeyId)
    ? pairing
    : undefined;
  const activePairing = retainedPairing?.status === 'pending'
    ? retainedPairing
    : undefined;

  if (selected && selected.id !== selectedAccountId) await saveSelectedMobileAccountId(selected.id);
  if (pairing && !retainedPairing) {
    await savePairingRequest(null);
  }
  await Promise.all([
    ...storedSessions
      .filter((session) => !sessions.some((live) => live.id === session.id))
      .map((session) => deleteBridgePrivateKey(session.channel?.privateKeyId)),
    pairing && !retainedPairing
      ? deleteBridgePrivateKey(pairing.channel?.privateKeyId)
      : Promise.resolve()
  ]);

  return {
    initialized: accounts.length > 0,
    locked: false,
    publicKey: selected?.publicKey,
    walletName: selected?.name,
    networkId: settings.networkId,
    theme: settings.theme,
    connections: validConnections,
    policies,
    bridgeStatus: activePairing
      ? 'pairing'
      : !accounts.length
        ? 'disconnected'
        : ['healthy', 'unchecked'].includes(bridgeHealth.status)
          ? 'connected'
          : 'error',
    bridgeHealth: accounts.length ? bridgeHealth : { status: 'unchecked' },
    transportConfigured: mobileSignerTransport.isConfigured(),
    mobileAccounts: accounts,
    mobileSessions: sessions.map(publicSession),
    selectedAccountId: selected?.id,
    pairing: publicPairing(activePairing),
    legacyWalletPresent: Boolean(legacyWallet)
  };
}

export async function setMobileNetwork(networkId: NetworkId) {
  if (!NETWORKS[networkId]) throw new Error('Unsupported network.');
  const state = await getMobileState();
  const selected = state.mobileAccounts.find((account) => account.id === state.selectedAccountId);
  if (selected && !selected.supportedNetworks.includes(networkId)) {
    throw new Error(`${selected.name} does not support ${NETWORKS[networkId].label}.`);
  }
  await saveSettings({ networkId });
  return getMobileState();
}

export async function setMobileTheme(theme: ThemeMode) {
  await saveSettings({ theme });
  return getMobileState();
}

async function startMobilePairingOnce() {
  const existing = await getPairingRequest();
  if (existing?.status === 'pending'
    && existing.expiresAt > Date.now()
    && existing.channel?.privateKeyId) {
    return publicPairing(existing)!;
  }
  if (existing) {
    await Promise.all([
      deleteBridgePrivateKey(existing.channel?.privateKeyId),
      savePairingRequest(null)
    ]);
  }
  const pairing = await mobileSignerTransport.createPairing();
  await saveBridgeHealth({ status: 'unchecked' });
  await savePairingRequest(pairing);
  return publicPairing(pairing)!;
}

export function startMobilePairing() {
  return inPairingQueue(startMobilePairingOnce);
}

async function refreshMobilePairingOnce() {
  const pairing = await getPairingRequest();
  if (!pairing) throw new Error('No mobile pairing is active.');
  if (pairing.expiresAt <= Date.now()) {
    const expired = { ...pairing, status: 'expired' as const };
    await Promise.all([
      savePairingRequest(null),
      deleteBridgePrivateKey(pairing.channel?.privateKeyId)
    ]);
    return { pairing: publicPairing(expired)! };
  }

  const result = await mobileSignerTransport.getPairingStatus(pairing);
  if (result.pairing.status === 'pending' || result.pairing.status === 'approved') {
    await savePairingRequest(result.pairing);
  } else {
    await Promise.all([
      savePairingRequest(null),
      deleteBridgePrivateKey(pairing.channel?.privateKeyId)
    ]);
  }

  if (result.session && result.accounts?.length) {
    await mutateMobileSessions((sessions) => [
      result.session!,
      ...sessions.filter((session) => session.id !== result.session!.id)
    ]);
    const accounts = await mutateMobileAccounts((current) => [
      ...result.accounts!,
      ...current.filter((account) => !result.accounts!.some((next) => next.id === account.id))
    ]);
    const accountKeys = new Map(accounts.map((account) => [account.id, account.publicKey]));
    await mutateConnections((connections) => connections.filter((connection) => (
      !connection.accountId || accountKeys.get(connection.accountId) === connection.publicKey
    )));
    await saveSelectedMobileAccountId(result.accounts[0].id);
    await saveBridgeHealth({
      status: 'healthy',
      checkedAt: Date.now()
    });
    await savePairingRequest(null);
  }

  return {
    ...result,
    pairing: publicPairing(result.pairing)!,
    session: result.session ? publicSession(result.session) : undefined
  };
}

export function refreshMobilePairing() {
  return inPairingQueue(refreshMobilePairingOnce);
}

async function cancelMobilePairingOnce() {
  const pairing = await getPairingRequest();
  if (pairing && pairing.status === 'pending') {
    await mobileSignerTransport.cancelPairing(pairing).catch(() => undefined);
  }
  await savePairingRequest(null);
  return getMobileState();
}

export function cancelMobilePairing() {
  return inPairingQueue(cancelMobilePairingOnce);
}

export async function selectMobileAccount(accountId: string) {
  const accounts = await getMobileAccounts();
  if (!accounts.some((account) => account.id === accountId)) {
    throw new Error('Mobile account not found.');
  }
  await saveSelectedMobileAccountId(accountId);
  return getMobileState();
}

export async function refreshMobileSessionHealth() {
  const [storedSessions, accounts, selectedAccountId] = await Promise.all([
    getMobileSessions(),
    getMobileAccounts(),
    getSelectedMobileAccountId()
  ]);
  const sessions = liveSessions(storedSessions);

  if (!sessions.length) {
    await saveBridgeHealth({ status: 'unchecked' });
    return getMobileState();
  }

  const healthFromError = (error: unknown): BridgeHealth => {
    const message = error instanceof Error
      ? error.message
      : 'Scopuly Bridge health check failed.';
    let status: BridgeHealth['status'] = 'incompatible';

    if (error instanceof BridgeTransportError) {
      status = error.retryable
        ? 'unreachable'
        : [401, 410].includes(error.status || 0)
          ? 'reconnect-required'
          : error.status === 404
            ? 'unreachable'
            : 'incompatible';
    } else if (isBridgePrivateKeyUnavailableError(error)) {
      status = 'reconnect-required';
    } else if (/protocol version mismatch/i.test(message)) {
      status = 'incompatible';
    }

    return {
      status,
      checkedAt: Date.now(),
      message
    };
  };

  const checks = await Promise.all(sessions.map(async (session) => {
    try {
      const lastSeenAt = await mobileSignerTransport.getSessionHealth(session);
      return {
        id: session.id,
        lastSeenAt,
        health: { status: 'healthy', checkedAt: Date.now() } as BridgeHealth
      };
    } catch (error) {
      return { id: session.id, lastSeenAt: session.lastSeenAt, health: healthFromError(error) };
    }
  }));
  const byId = new Map(checks.map((check) => [check.id, check]));
  await mutateMobileSessions((current) => current.map((session) => {
    const check = byId.get(session.id);
    return check
      ? { ...session, lastSeenAt: check.lastSeenAt, health: check.health }
      : session;
  }));

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
    || accounts.find((account) => sessions.some((session) => session.id === account.sessionId));
  const activeCheck = checks.find((check) => check.id === selectedAccount?.sessionId)
    || checks[0];
  const operationalCheck = checks.find((check) => check.health.status === 'healthy');
  await saveBridgeHealth(operationalCheck?.health || activeCheck?.health || {
    status: 'healthy',
    checkedAt: Date.now()
  });

  return getMobileState();
}

export async function markMobileSessionHealthy(sessionId: string) {
  const health: BridgeHealth = {status: 'healthy', checkedAt: Date.now()};
  await mutateMobileSessions((sessions) => sessions.map((session) => (
    session.id === sessionId
      ? {...session, lastSeenAt: health.checkedAt!, health}
      : session
  )));
  await saveBridgeHealth(health);
}

export async function disconnectMobileSession(sessionId: string) {
  const [accounts, sessions] = await Promise.all([
    getMobileAccounts(),
    getMobileSessions()
  ]);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return getMobileState();
  if (session.channel) await mobileSignerTransport.disconnect(session);

  const removedAccountIds = new Set(
    accounts.filter((item) => item.sessionId === sessionId).map((item) => item.id)
  );
  const remainingAccounts = await mutateMobileAccounts((current) => (
    current.filter((item) => item.sessionId !== sessionId)
  ));
  const remainingSessions = await mutateMobileSessions((current) => (
    current.filter((item) => item.id !== sessionId)
  ));
  await Promise.all([
    mutateConnections((current) => current.filter((connection) => (
      !connection.accountId || !removedAccountIds.has(connection.accountId)
    ))),
    saveSelectedMobileAccountId(remainingAccounts[0]?.id || '')
  ]);
  if (!remainingSessions.length) {
    await saveBridgeHealth({ status: 'unchecked' });
  }
  return getMobileState();
}

export async function touchMobileOrigin(origin: string) {
  const connection = await getOriginConnection(origin);
  if (!connection) return null;
  const next = { ...connection, lastUsedAt: Date.now() };
  await upsertConnection(next);
  return next;
}

export async function getSelectedMobileAccount() {
  const state = await getMobileState();
  return state.mobileAccounts.find((account) => account.id === state.selectedAccountId) || null;
}

export async function connectMobileOrigin(
  origin: string,
  appName: string,
  icon?: string,
  requestedAccountId?: string
) {
  const state = await getMobileState();
  const requestedAccount = requestedAccountId
    ? state.mobileAccounts.find((item) => item.id === requestedAccountId)
    : undefined;
  if (requestedAccountId && !requestedAccount) {
    throw new Error('The requested Scopuly Mobile account is no longer available.');
  }
  const account = requestedAccount
    || state.mobileAccounts.find((item) => item.id === state.selectedAccountId);
  if (!account) throw new Error('Connect Scopuly Mobile before connecting a dApp.');

  const now = Date.now();
  const connection: OriginConnection = {
    origin,
    name: appName || origin,
    icon,
    accountId: account.id,
    publicKey: account.publicKey,
    connectedAt: now,
    lastUsedAt: now
  };
  await upsertConnection(connection);
  return { address: account.publicKey };
}

export async function disconnectMobileOrigin(origin: string) {
  await removeConnection(origin);
  return getMobileState();
}

export async function getOriginConnection(origin: string) {
  const connections = await getConnections();
  return connections.find((connection) => connection.origin === origin) || null;
}
