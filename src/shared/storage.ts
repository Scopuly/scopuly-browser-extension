import {
  DEFAULT_SETTINGS,
  type DappPolicy,
  type DappPolicyStatus,
  type BridgeHealth,
  type ExtensionSettings,
  type MobileAccount,
  type MobileSession,
  type OriginConnection,
  type PairingRequest,
  type PendingRequest,
  type WalletRecord
} from './types';

const KEYS = {
  wallet: 'scopuly.wallet',
  settings: 'scopuly.settings',
  connections: 'scopuly.connections',
  policies: 'scopuly.policies',
  mobileAccounts: 'scopuly.mobileAccounts',
  mobileSessions: 'scopuly.mobileSessions',
  bridgeHealth: 'scopuly.bridgeHealth',
  selectedMobileAccount: 'scopuly.selectedMobileAccount',
  pairing: 'scopuly.pairing',
  pendingRequests: 'scopuly.pendingRequests'
};
const TERMINAL_REQUEST_RETENTION_MS = 15 * 60 * 1000;
const TERMINAL_REQUEST_STATUSES = new Set(['completed', 'rejected', 'expired', 'failed']);
const storageMutationQueues = new Map<string, Promise<void>>();

async function inStorageMutationQueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = storageMutationQueues.get(key) || Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  storageMutationQueues.set(key, tail);
  await previous;

  try {
    return await task();
  } finally {
    release();
    if (storageMutationQueues.get(key) === tail) storageMutationQueues.delete(key);
  }
}

function getMany<T extends Record<string, unknown>>(keys: string[]): Promise<T> {
  return chrome.storage.local.get(keys) as Promise<T>;
}

export async function getWalletRecord() {
  const result = await getMany<{ [KEYS.wallet]?: WalletRecord }>([KEYS.wallet]);
  return result[KEYS.wallet] || null;
}

export async function saveWalletRecord(wallet: WalletRecord) {
  await chrome.storage.local.set({ [KEYS.wallet]: wallet });
}

export async function removeWalletRecord() {
  await chrome.storage.local.remove(KEYS.wallet);
}

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await getMany<{ [KEYS.settings]?: Partial<ExtensionSettings> }>([KEYS.settings]);
  return { ...DEFAULT_SETTINGS, ...(result[KEYS.settings] || {}) };
}

export async function saveSettings(settings: Partial<ExtensionSettings>) {
  await inStorageMutationQueue(KEYS.settings, async () => {
    const current = await getSettings();
    await chrome.storage.local.set({ [KEYS.settings]: { ...current, ...settings } });
  });
}

export async function getConnections(): Promise<OriginConnection[]> {
  const result = await getMany<{ [KEYS.connections]?: OriginConnection[] }>([KEYS.connections]);
  return result[KEYS.connections] || [];
}

export async function saveConnections(connections: OriginConnection[]) {
  await inStorageMutationQueue(KEYS.connections, async () => {
    await chrome.storage.local.set({ [KEYS.connections]: connections });
  });
}

export async function mutateConnections(
  mutate: (connections: OriginConnection[]) => OriginConnection[]
) {
  return inStorageMutationQueue(KEYS.connections, async () => {
    const connections = await getConnections();
    const next = mutate(connections);
    await chrome.storage.local.set({ [KEYS.connections]: next });
    return next;
  });
}

export async function upsertConnection(connection: OriginConnection) {
  return mutateConnections((connections) => (
    [connection, ...connections.filter((item) => item.origin !== connection.origin)].slice(0, 80)
  ));
}

export async function removeConnection(origin: string) {
  return mutateConnections((connections) => connections.filter((item) => item.origin !== origin));
}

export async function getDappPolicies(): Promise<DappPolicy[]> {
  const result = await getMany<{ [KEYS.policies]?: DappPolicy[] }>([KEYS.policies]);
  return result[KEYS.policies] || [];
}

export async function saveDappPolicies(policies: DappPolicy[]) {
  await inStorageMutationQueue(KEYS.policies, async () => {
    await chrome.storage.local.set({ [KEYS.policies]: policies });
  });
}

export async function mutateDappPolicies(
  mutate: (policies: DappPolicy[]) => DappPolicy[]
) {
  return inStorageMutationQueue(KEYS.policies, async () => {
    const policies = await getDappPolicies();
    const next = mutate(policies);
    await chrome.storage.local.set({ [KEYS.policies]: next });
    return next;
  });
}

export async function upsertDappPolicy(origin: string, status: DappPolicyStatus, name = '') {
  const policy: DappPolicy = { origin, status, name, updatedAt: Date.now() };
  return mutateDappPolicies((policies) => (
    [policy, ...policies.filter((item) => item.origin !== origin)].slice(0, 120)
  ));
}

export async function removeDappPolicy(origin: string) {
  return mutateDappPolicies((policies) => policies.filter((item) => item.origin !== origin));
}

export async function getMobileAccounts(): Promise<MobileAccount[]> {
  const result = await getMany<{ [KEYS.mobileAccounts]?: MobileAccount[] }>([KEYS.mobileAccounts]);
  return result[KEYS.mobileAccounts] || [];
}

export async function saveMobileAccounts(accounts: MobileAccount[]) {
  await inStorageMutationQueue(KEYS.mobileAccounts, async () => {
    await chrome.storage.local.set({ [KEYS.mobileAccounts]: accounts.slice(0, 20) });
  });
}

export async function mutateMobileAccounts(
  mutate: (accounts: MobileAccount[]) => MobileAccount[]
) {
  return inStorageMutationQueue(KEYS.mobileAccounts, async () => {
    const accounts = await getMobileAccounts();
    const next = mutate(accounts).slice(0, 20);
    await chrome.storage.local.set({ [KEYS.mobileAccounts]: next });
    return next;
  });
}

export async function getMobileSessions(): Promise<MobileSession[]> {
  const result = await getMany<{ [KEYS.mobileSessions]?: MobileSession[] }>([KEYS.mobileSessions]);
  return result[KEYS.mobileSessions] || [];
}

export async function saveMobileSessions(sessions: MobileSession[]) {
  await inStorageMutationQueue(KEYS.mobileSessions, async () => {
    await chrome.storage.local.set({ [KEYS.mobileSessions]: sessions.slice(0, 20) });
  });
}

export async function mutateMobileSessions(
  mutate: (sessions: MobileSession[]) => MobileSession[]
) {
  return inStorageMutationQueue(KEYS.mobileSessions, async () => {
    const sessions = await getMobileSessions();
    const next = mutate(sessions).slice(0, 20);
    await chrome.storage.local.set({ [KEYS.mobileSessions]: next });
    return next;
  });
}

export async function getBridgeHealth(): Promise<BridgeHealth> {
  const result = await getMany<{ [KEYS.bridgeHealth]?: BridgeHealth }>([KEYS.bridgeHealth]);
  return result[KEYS.bridgeHealth] || { status: 'unchecked' };
}

export async function saveBridgeHealth(health: BridgeHealth) {
  await chrome.storage.local.set({ [KEYS.bridgeHealth]: health });
}

export async function getSelectedMobileAccountId() {
  const result = await getMany<{ [KEYS.selectedMobileAccount]?: string }>([KEYS.selectedMobileAccount]);
  return result[KEYS.selectedMobileAccount] || '';
}

export async function saveSelectedMobileAccountId(accountId: string) {
  await chrome.storage.local.set({ [KEYS.selectedMobileAccount]: accountId });
}

export async function getPairingRequest(): Promise<PairingRequest | null> {
  const result = await getMany<{ [KEYS.pairing]?: PairingRequest }>([KEYS.pairing]);
  return result[KEYS.pairing] || null;
}

export async function savePairingRequest(pairing: PairingRequest | null) {
  if (!pairing) {
    await chrome.storage.local.remove(KEYS.pairing);
    return;
  }
  await chrome.storage.local.set({ [KEYS.pairing]: pairing });
}

async function readStoredPendingRequests(): Promise<PendingRequest[]> {
  const result = await getMany<{ [KEYS.pendingRequests]?: PendingRequest[] }>([KEYS.pendingRequests]);
  return result[KEYS.pendingRequests] || [];
}

function retainPendingRequests(stored: PendingRequest[], now = Date.now()) {
  return stored.filter((request) => (
    TERMINAL_REQUEST_STATUSES.has(request.status)
      ? request.updatedAt > now - TERMINAL_REQUEST_RETENTION_MS
      : request.expiresAt > now
  ));
}

function limitPendingRequests(requests: PendingRequest[]) {
  const active = requests.filter((request) => !TERMINAL_REQUEST_STATUSES.has(request.status));
  const terminal = requests.filter((request) => TERMINAL_REQUEST_STATUSES.has(request.status));
  return [...active, ...terminal.slice(0, Math.max(0, 100 - active.length))];
}

export async function getPendingRequests(): Promise<PendingRequest[]> {
  return inStorageMutationQueue(KEYS.pendingRequests, async () => {
    const stored = await readStoredPendingRequests();
  const now = Date.now();
    const retained = retainPendingRequests(stored, now);
    if (retained.length !== stored.length) {
      await chrome.storage.local.set({ [KEYS.pendingRequests]: retained });
    }
    return retained;
  });
}

export async function getPendingRequestRecord(id: string) {
  return inStorageMutationQueue(KEYS.pendingRequests, async () => {
    const stored = await readStoredPendingRequests();
    const now = Date.now();
    const target = stored.find((request) => request.id === id);
    if (target && !TERMINAL_REQUEST_STATUSES.has(target.status) && target.expiresAt <= now) {
      // Let the request state machine persist and return the stable expired result
      // before the general retention sweep removes stale active payloads.
      return target;
    }
    const retained = retainPendingRequests(stored, now);
    if (retained.length !== stored.length) {
      await chrome.storage.local.set({ [KEYS.pendingRequests]: retained });
    }
    return retained.find((request) => request.id === id) || null;
  });
}

export async function savePendingRequestRecord(request: PendingRequest) {
  return inStorageMutationQueue(KEYS.pendingRequests, async () => {
    const stored = await readStoredPendingRequests();
    const next = limitPendingRequests(retainPendingRequests(
      [request, ...stored.filter((item) => item.id !== request.id)]
    ));
    await chrome.storage.local.set({ [KEYS.pendingRequests]: next });
    return request;
  });
}

export async function insertPendingRequestRecord(
  request: PendingRequest,
  validate: (requests: PendingRequest[]) => void
) {
  return inStorageMutationQueue(KEYS.pendingRequests, async () => {
    const requests = retainPendingRequests(await readStoredPendingRequests());
    validate(requests);
    const next = limitPendingRequests([
      request,
      ...requests.filter((item) => item.id !== request.id)
    ]);
    await chrome.storage.local.set({ [KEYS.pendingRequests]: next });
    return request;
  });
}

export async function updatePendingRequestRecord(
  id: string,
  update: (request: PendingRequest) => PendingRequest
) {
  return inStorageMutationQueue(KEYS.pendingRequests, async () => {
    const stored = await readStoredPendingRequests();
    const current = stored.find((request) => request.id === id);
    if (!current) return null;
    const nextRequest = update(current);
    const next = limitPendingRequests(retainPendingRequests([
      nextRequest,
      ...stored.filter((request) => request.id !== id)
    ]));
    await chrome.storage.local.set({ [KEYS.pendingRequests]: next });
    return nextRequest;
  });
}

export async function removePendingRequestRecord(id: string) {
  await inStorageMutationQueue(KEYS.pendingRequests, async () => {
    const requests = retainPendingRequests(await readStoredPendingRequests());
    await chrome.storage.local.set({
      [KEYS.pendingRequests]: requests.filter((request) => request.id !== id)
    });
  });
}
