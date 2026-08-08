const POLL_INTERVAL_MS = 750;
const POLL_MAX_INTERVAL_MS = 3_000;
const SITE_ICON_MAX_BYTES = 48 * 1024;
const SITE_ICON_TIMEOUT_MS = 1_500;
const SITE_ICON_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon'
]);
const siteIconCache = new Map<string, Promise<string | undefined>>();

type ProviderSnapshot = {
  address: string;
  isConnected: boolean;
  network: string;
  networkPassphrase: string;
};

type ProviderChange = ProviderSnapshot & {
  changed: Array<keyof ProviderSnapshot>;
};

let providerSnapshot: ProviderSnapshot | undefined;

function reply(id: string, result: { ok: boolean; response?: unknown; error?: unknown }) {
  window.postMessage({
    target: 'scopuly-inpage',
    id,
    ok: result.ok,
    response: result.response,
    error: result.error
  }, window.location.origin);
}

function emitProviderChange(detail: ProviderChange) {
  window.postMessage({
    target: 'scopuly-inpage-event',
    type: 'change',
    detail
  }, window.location.origin);
}

function runtimeMessage(message: Record<string, unknown>) {
  return new Promise<any>((resolve) => {
    chrome.runtime.sendMessage(message, (result) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: { code: -3, message: chrome.runtime.lastError.message }
        });
        return;
      }
      resolve(result);
    });
  });
}

function base64DataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function fetchSiteIcon(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;

  let url: URL;
  try {
    url = new URL(value, window.location.href);
  } catch (_error) {
    return undefined;
  }
  if (url.origin !== window.location.origin || !['https:', 'http:'].includes(url.protocol)) {
    return undefined;
  }

  const cached = siteIconCache.get(url.href);
  if (cached) return cached;
  const pending = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SITE_ICON_TIMEOUT_MS);
    try {
      const response = await fetch(url.href, {
        cache: 'force-cache',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) return undefined;
      const mimeType = (response.headers.get('content-type') || '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
      if (!SITE_ICON_MIME_TYPES.has(mimeType)) return undefined;
      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (declaredSize > SITE_ICON_MAX_BYTES) return undefined;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > SITE_ICON_MAX_BYTES) return undefined;
      return base64DataUrl(bytes, mimeType);
    } catch (_error) {
      return undefined;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  siteIconCache.set(url.href, pending);
  if (siteIconCache.size > 32) {
    siteIconCache.delete(siteIconCache.keys().next().value!);
  }
  return pending;
}

async function refreshProviderSnapshot(emit = true) {
  const result = await runtimeMessage({ type: 'SCOPULY_PROVIDER_SNAPSHOT' });
  if (!result?.ok || !result.response) return;

  const next = result.response as ProviderSnapshot;
  const changed = (['address', 'isConnected', 'network', 'networkPassphrase'] as const)
    .filter((key) => providerSnapshot?.[key] !== next[key]);
  const hadSnapshot = Boolean(providerSnapshot);
  providerSnapshot = next;
  if (emit && (hadSnapshot ? changed.length > 0 : true)) {
    emitProviderChange({ ...next, changed: [...changed] });
  }
}

async function pollRequest(
  pageRequestId: string,
  pendingRequestId: string,
  expiresAt: number,
  delay = POLL_INTERVAL_MS
) {
  if (Date.now() >= expiresAt) {
    reply(pageRequestId, {
      ok: false,
      error: { code: -3, message: 'Scopuly request expired.' }
    });
    return;
  }

  const result = await runtimeMessage({
    type: 'SCOPULY_PROVIDER_REQUEST_STATUS',
    requestId: pendingRequestId
  });
  if (!result?.ok) {
    reply(pageRequestId, {
      ok: false,
      error: result?.error || { code: -1, message: 'Scopuly request failed.' }
    });
    return;
  }

  if (result.response?.done) {
    reply(pageRequestId, result.response.error
      ? { ok: false, error: result.response.error }
      : { ok: true, response: result.response.response });
    return;
  }

  window.setTimeout(
    () => void pollRequest(
      pageRequestId,
      pendingRequestId,
      expiresAt,
      Math.min(Math.ceil(delay * 1.5), POLL_MAX_INTERVAL_MS)
    ),
    delay
  );
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.target !== 'scopuly-content') return;

  const pageRequestId = typeof event.data.id === 'string' ? event.data.id : '';
  const pagePayload = event.data.payload || {};
  void fetchSiteIcon(pagePayload.icon).then((siteIcon) => runtimeMessage({
    type: 'SCOPULY_PROVIDER_REQUEST',
    payload: {
      method: pagePayload.method,
      params: pagePayload.params,
      appName: pagePayload.appName,
      icon: siteIcon
    }
  })).then((result) => {
    if (!result?.ok) {
      reply(pageRequestId, {
        ok: false,
        error: result?.error || { code: -1, message: 'Scopuly request failed.' }
      });
      return;
    }

    const pendingRequestId = result.response?.pendingRequestId;
    if (typeof pendingRequestId === 'string') {
      void pollRequest(pageRequestId, pendingRequestId, Number(result.response.expiresAt || Date.now()));
      return;
    }
    reply(pageRequestId, { ok: true, response: result.response });
  });
});

const PROVIDER_STORAGE_KEYS = new Set([
  'scopuly.connections',
  'scopuly.mobileAccounts',
  'scopuly.mobileSessions',
  'scopuly.settings'
]);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!Object.keys(changes).some((key) => PROVIDER_STORAGE_KEYS.has(key))) return;
  void refreshProviderSnapshot();
});

void refreshProviderSnapshot(false);
