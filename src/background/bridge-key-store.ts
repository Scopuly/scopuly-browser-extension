const DATABASE_NAME = 'scopuly-extension-bridge-v1';
const DATABASE_VERSION = 1;
const KEY_STORE = 'privateKeys';
const memoryKeys = new Map<string, BridgePrivateKeyRecord>();

type BridgePrivateKeyRecord = {
  id: string;
  privateKey: CryptoKey;
  createdAt: number;
  expiresAt: number;
};

export class BridgePrivateKeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgePrivateKeyUnavailableError';
  }
}

export function isBridgePrivateKeyUnavailableError(error: unknown) {
  return error instanceof BridgePrivateKeyUnavailableError;
}

function validatePrivateKey(privateKey: CryptoKey) {
  if (!privateKey
    || privateKey.type !== 'private'
    || privateKey.extractable !== false
    || privateKey.algorithm.name !== 'ECDH'
    || (privateKey.algorithm as EcKeyAlgorithm).namedCurve !== 'P-256'
    || !privateKey.usages.includes('deriveBits')) {
    throw new Error('Invalid non-extractable Scopuly bridge private key.');
  }
  return privateKey;
}

function validateExpiration(expiresAt: number) {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Invalid Scopuly bridge key expiration.');
  }
  return expiresAt;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error || new Error('Scopuly bridge key database request failed.')
    );
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error || new Error('Scopuly bridge key transaction was aborted.')
    );
    transaction.onerror = () => reject(
      transaction.error || new Error('Scopuly bridge key transaction failed.')
    );
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) {
        request.result.createObjectStore(KEY_STORE, {keyPath: 'id'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error || new Error('Unable to open the Scopuly bridge key database.')
    );
    request.onblocked = () => reject(
      new Error('The Scopuly bridge key database upgrade is blocked.')
    );
  });
}

function usesIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function usesTestMemoryStore() {
  const runtime = globalThis as typeof globalThis & {
    process?: {env?: {NODE_ENV?: string}};
  };
  return runtime.process?.env?.NODE_ENV === 'test';
}

function requireStorageBackend() {
  if (!usesIndexedDb() && !usesTestMemoryStore()) {
    throw new Error('IndexedDB is unavailable for Scopuly bridge key storage.');
  }
}

export async function saveBridgePrivateKey(
  id: string,
  privateKey: CryptoKey,
  expiresAt: number
) {
  requireStorageBackend();
  if (typeof id !== 'string' || !id || id.length > 200) {
    throw new Error('Invalid Scopuly bridge private key ID.');
  }
  const record: BridgePrivateKeyRecord = {
    id,
    privateKey: validatePrivateKey(privateKey),
    createdAt: Date.now(),
    expiresAt: validateExpiration(expiresAt)
  };
  if (!usesIndexedDb()) {
    memoryKeys.set(id, record);
    return;
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(KEY_STORE, 'readwrite');
    transaction.objectStore(KEY_STORE).put(record);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getBridgePrivateKey(id: string) {
  requireStorageBackend();
  let record: BridgePrivateKeyRecord | undefined;
  if (!usesIndexedDb()) {
    record = memoryKeys.get(id);
  } else {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(KEY_STORE, 'readonly');
      record = await requestResult(
        transaction.objectStore(KEY_STORE).get(id)
      ) as BridgePrivateKeyRecord | undefined;
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }
  if (!record) {
    throw new BridgePrivateKeyUnavailableError(
      'Scopuly bridge private key was not found.'
    );
  }
  if (record.expiresAt <= Date.now()) {
    await deleteBridgePrivateKey(id);
    throw new BridgePrivateKeyUnavailableError('Scopuly bridge private key expired.');
  }
  return validatePrivateKey(record.privateKey);
}

export async function updateBridgePrivateKeyExpiration(id: string, expiresAt: number) {
  requireStorageBackend();
  const nextExpiration = validateExpiration(expiresAt);
  if (!usesIndexedDb()) {
    const record = memoryKeys.get(id);
    if (!record) {
      throw new BridgePrivateKeyUnavailableError(
        'Scopuly bridge private key was not found.'
      );
    }
    memoryKeys.set(id, {...record, expiresAt: nextExpiration});
    return;
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(KEY_STORE, 'readwrite');
    const store = transaction.objectStore(KEY_STORE);
    const record = await requestResult(store.get(id)) as BridgePrivateKeyRecord | undefined;
    if (!record) {
      transaction.abort();
      throw new BridgePrivateKeyUnavailableError(
        'Scopuly bridge private key was not found.'
      );
    }
    store.put({...record, expiresAt: nextExpiration});
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteBridgePrivateKey(id: string | undefined) {
  if (!id) return;
  requireStorageBackend();
  if (!usesIndexedDb()) {
    memoryKeys.delete(id);
    return;
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(KEY_STORE, 'readwrite');
    transaction.objectStore(KEY_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
