import { getProvider } from '@scopuly/signer-extension-api';
import { Networks } from '@stellar/stellar-sdk';
import './styles.css';
import {
  buildSafeTransaction,
  loadAccountSequence,
  networkLabel,
  providerError,
  shortAddress,
  summarizeSignedTransaction
} from './helpers';

const elements = {
  environmentBadge: required('environment-badge'),
  providerDot: required('provider-dot'),
  providerStatus: required('provider-status'),
  providerVersion: required('provider-version'),
  connectionBadge: required('connection-badge'),
  account: required('account-value'),
  network: required('network-value'),
  networkPublic: required<HTMLButtonElement>('network-public'),
  networkTestnet: required<HTMLButtonElement>('network-testnet'),
  networkGuidance: required('network-guidance'),
  message: required<HTMLTextAreaElement>('message-input'),
  transactionTitle: required('transaction-title'),
  transactionHint: required('transaction-hint'),
  transactionXdr: required<HTMLTextAreaElement>('transaction-xdr'),
  submitConfirmation: required<HTMLInputElement>('submit-confirmation'),
  submitConfirmationText: required('submit-confirmation-text'),
  submitButton: required<HTMLButtonElement>('submit-button'),
  authEntry: required<HTMLTextAreaElement>('auth-entry'),
  receiptId: required<HTMLInputElement>('receipt-id'),
  result: required<HTMLPreElement>('result-output'),
  log: required<HTMLUListElement>('session-log')
};

let connectedAddress = '';
let currentNetworkPassphrase = '';
let providerNetworkPassphrase = '';
let networkSelectionWasExplicit = false;
let latestResult = 'No request completed yet.';

async function revealPlayground() {
  if (document.readyState !== 'complete') {
    await new Promise<void>((resolve) => {
      window.addEventListener('load', () => resolve(), { once: true });
    });
  }

  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });

  const appShell = document.getElementById('app-shell');
  const loader = document.getElementById('playground-loader');
  appShell?.removeAttribute('aria-hidden');
  appShell?.removeAttribute('inert');
  document.documentElement.classList.add('playground-ready');

  if (!loader) return;
  loader.addEventListener('transitionend', () => loader.remove(), { once: true });
  window.setTimeout(() => loader.remove(), 400);
}

function required<T extends HTMLElement = HTMLElement>(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing playground element #${id}`);
  return node as T;
}

function provider() {
  const current = getProvider();
  if (!current.isScopuly || current.platform !== 'extension') {
    throw new Error('Scopuly extension provider was not detected. Install or reload the extension.');
  }
  return current;
}

function setProviderAvailable(available: boolean) {
  document.querySelectorAll<HTMLButtonElement>('[data-requires-provider]')
    .forEach((button) => { button.disabled = !available; });
  elements.providerDot.classList.toggle('online', available);
  elements.providerStatus.textContent = available ? 'Detected' : 'Not detected';
  elements.providerVersion.textContent = available
    ? `v${window.scopuly?.__scopulyProviderVersion || 'unknown'} · ${window.scopuly?.platform || 'extension'}`
    : 'Install or reload Scopuly – Stellar Signer';
}

function log(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  const item = document.createElement('li');
  item.className = kind;
  const time = document.createElement('time');
  time.dateTime = new Date().toISOString();
  time.textContent = new Date().toLocaleTimeString();
  const text = document.createElement('span');
  text.textContent = message;
  item.append(time, text);
  elements.log.prepend(item);
}

function showResult(label: string, value: unknown) {
  latestResult = JSON.stringify({ label, value }, null, 2);
  elements.result.textContent = latestResult;
}

function requireSupportedNetwork() {
  networkLabel(currentNetworkPassphrase);
  return currentNetworkPassphrase;
}

function updateNetworkStatus() {
  const selectedLabel = networkLabel(currentNetworkPassphrase);
  const publicSelected = currentNetworkPassphrase === Networks.PUBLIC;
  elements.environmentBadge.textContent = `Open source · Stellar ${selectedLabel} selected`;
  elements.networkPublic.classList.toggle('active', publicSelected);
  elements.networkPublic.setAttribute('aria-pressed', String(publicSelected));
  elements.networkTestnet.classList.toggle('active', !publicSelected);
  elements.networkTestnet.setAttribute('aria-pressed', String(!publicSelected));

  elements.networkGuidance.className = 'network-guidance';
  if (!providerNetworkPassphrase) {
    elements.networkGuidance.textContent = 'The playground and extension must use the same network for signing.';
  } else if (providerNetworkPassphrase === currentNetworkPassphrase) {
    elements.networkGuidance.textContent = `${selectedLabel} matches the extension. Ready to sign.`;
    elements.networkGuidance.classList.add('ready');
  } else {
    elements.networkGuidance.textContent = `Switch the extension to ${selectedLabel}, then click Refresh before signing.`;
    elements.networkGuidance.classList.add('warning');
  }
}

function selectNetwork(networkPassphrase: string, announce = true) {
  networkLabel(networkPassphrase);
  const changed = currentNetworkPassphrase !== networkPassphrase;
  currentNetworkPassphrase = networkPassphrase;
  if (changed) {
    elements.transactionXdr.value = '';
    elements.submitConfirmation.checked = false;
  }
  updateNetworkCopy();
  updateNetworkStatus();
  if (announce) {
    log(`Playground network selected: ${networkLabel(networkPassphrase)}.`);
  }
}

function applyProviderNetwork(network: { network: string; networkPassphrase: string }) {
  networkLabel(network.networkPassphrase);
  providerNetworkPassphrase = network.networkPassphrase;
  elements.network.textContent = network.network;
  elements.network.className = network.network === 'TESTNET' ? 'testnet-value' : 'mainnet-value';
  updateNetworkStatus();
}

async function requireMatchingProviderNetwork() {
  const selectedNetworkPassphrase = requireSupportedNetwork();
  const network = await provider().getNetwork();
  applyProviderNetwork(network);
  if (network.networkPassphrase !== selectedNetworkPassphrase) {
    throw new Error(
      `Playground is set to ${networkLabel(selectedNetworkPassphrase)}, but the extension is set to ${networkLabel(network.networkPassphrase)}. Switch the extension network and click Refresh.`
    );
  }
  return selectedNetworkPassphrase;
}

function updateNetworkCopy() {
  const label = networkLabel(currentNetworkPassphrase);
  const isMainnet = currentNetworkPassphrase === Networks.PUBLIC;
  elements.transactionTitle.textContent = `No-value ${label} transaction`;
  elements.transactionHint.innerHTML = `The builder loads the connected account sequence from Horizon ${label} and creates a five-minute <code>manageData</code> transaction. Signing alone never submits it.`;
  elements.transactionXdr.placeholder = `Build a ${label} transaction or paste an XDR envelope`;
  elements.submitConfirmationText.textContent = isMainnet
    ? 'I understand that this submits a real Mainnet manageData operation, changes the account data entry and consumes a real XLM fee.'
    : 'I understand that this submits a Testnet manageData operation and consumes a Testnet fee.';
  elements.submitButton.textContent = `Sign and submit to ${label}`;
}

function normalizeAddress(result: unknown) {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const candidate = result as { address?: unknown; publicKey?: unknown };
    if (typeof candidate.address === 'string') return candidate.address;
    if (typeof candidate.publicKey === 'string') return candidate.publicKey;
  }
  return '';
}

async function refreshConnection() {
  const scopuly = provider();
  const [{ isConnected }, network] = await Promise.all([
    scopuly.isConnected(),
    scopuly.getNetwork()
  ]);
  applyProviderNetwork(network);
  if (!networkSelectionWasExplicit) selectNetwork(network.networkPassphrase, false);

  if (isConnected) {
    connectedAddress = normalizeAddress(await scopuly.getAddress()) || await scopuly.getPublicKey();
    elements.account.textContent = shortAddress(connectedAddress);
    elements.account.title = connectedAddress;
    elements.connectionBadge.textContent = 'Connected';
    elements.connectionBadge.className = 'pill success';
  } else {
    connectedAddress = '';
    elements.account.textContent = 'Not connected';
    elements.account.removeAttribute('title');
    elements.connectionBadge.textContent = 'Disconnected';
    elements.connectionBadge.className = 'pill neutral';
  }
  log(`Connection refreshed: ${isConnected ? 'connected' : 'disconnected'}, ${network.network}.`);
}

async function runAction(button: HTMLButtonElement, action: () => Promise<void>) {
  const label = button.textContent || 'Run';
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    await action();
  } catch (error) {
    const failure = providerError(error);
    showResult('error', failure);
    log(`${failure.code === -4 ? 'Rejected' : 'Failed'}: ${failure.message}`, 'error');
  } finally {
    button.textContent = label;
    button.disabled = !window.scopuly?.isScopuly;
  }
}

const actions: Record<string, () => Promise<void>> = {
  connect: async () => {
    const result = await provider().requestAccess();
    connectedAddress = normalizeAddress(result);
    await refreshConnection();
    showResult('requestAccess', { address: connectedAddress });
    log('This origin received explicit account access.', 'success');
  },
  refresh: refreshConnection,
  disconnect: async () => {
    await provider().disconnect();
    await refreshConnection();
    showResult('disconnect', { disconnected: true });
    log('Origin permission disconnected.', 'success');
  },
  'sign-message': async () => {
    const networkPassphrase = await requireMatchingProviderNetwork();
    if (!connectedAddress) throw new Error('Connect a Scopuly account first.');
    const message = elements.message.value;
    const result = await provider().signMessage(message, {
      address: connectedAddress,
      networkPassphrase
    });
    showResult('signMessage', result);
    log('SEP-53 message signature returned and verified by the extension.', 'success');
  },
  'build-transaction': async () => {
    const networkPassphrase = requireSupportedNetwork();
    if (!connectedAddress) throw new Error('Connect a Scopuly account first.');
    const sequence = await loadAccountSequence(connectedAddress, networkPassphrase);
    const xdr = buildSafeTransaction(connectedAddress, sequence, networkPassphrase);
    elements.transactionXdr.value = xdr;
    showResult('buildTransaction', summarizeSignedTransaction(xdr, networkPassphrase));
    log(`Built a no-value ${networkLabel(networkPassphrase)} manageData transaction.`, 'success');
  },
  'sign-transaction': async () => {
    const networkPassphrase = await requireMatchingProviderNetwork();
    if (!connectedAddress) throw new Error('Connect a Scopuly account first.');
    const xdr = elements.transactionXdr.value.trim();
    if (!xdr) throw new Error('Build or paste a transaction XDR first.');
    const result = await provider().signTransaction(xdr, {
      address: connectedAddress,
      networkPassphrase
    });
    const signedXdr = String(result.signedXDR || result.signedTxXdr || '');
    showResult('signTransaction', {
      ...result,
      summary: signedXdr ? summarizeSignedTransaction(signedXdr, networkPassphrase) : undefined
    });
    log(`Signed ${networkLabel(networkPassphrase)} XDR returned and verified by the extension.`, 'success');
  },
  'submit-transaction': async () => {
    const networkPassphrase = await requireMatchingProviderNetwork();
    if (!elements.submitConfirmation.checked) {
      throw new Error(`Confirm the ${networkLabel(networkPassphrase)} submission checkbox first.`);
    }
    if (!connectedAddress) throw new Error('Connect a Scopuly account first.');
    const xdr = elements.transactionXdr.value.trim();
    if (!xdr) throw new Error('Build or paste a transaction XDR first.');
    const result = await provider().signAndSubmitTransaction(xdr, {
      address: connectedAddress,
      networkPassphrase
    });
    showResult('signAndSubmitTransaction', result);
    log(`${networkLabel(networkPassphrase)} transaction submission result returned.`, 'success');
  },
  'sign-auth': async () => {
    const networkPassphrase = await requireMatchingProviderNetwork();
    if (!connectedAddress) throw new Error('Connect a Scopuly account first.');
    const authEntry = elements.authEntry.value.trim();
    if (!authEntry) throw new Error('Paste a Soroban authorization preimage XDR first.');
    const result = await provider().signAuthEntry(authEntry, {
      address: connectedAddress,
      networkPassphrase
    });
    showResult('signAuthEntry', result);
    log('Soroban authorization signature returned and verified.', 'success');
  },
  'report-receipt': async () => {
    const receiptId = elements.receiptId.value.trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(receiptId)) {
      throw new Error('Receipt ID must contain exactly 32 lowercase hexadecimal characters.');
    }
    const result = await provider().reportX402Receipt({ receiptId });
    showResult('reportX402Receipt', result);
    log('x402 receipt response returned.', 'success');
  },
  'copy-result': async () => {
    await navigator.clipboard.writeText(latestResult);
    log('Latest result copied.', 'success');
  },
  'clear-log': async () => {
    elements.log.innerHTML = '';
  }
};

document.querySelectorAll<HTMLButtonElement>('[data-network]').forEach((button) => {
  button.addEventListener('click', () => {
    networkSelectionWasExplicit = true;
    selectNetwork(button.dataset.network === 'TESTNET' ? Networks.TESTNET : Networks.PUBLIC);
  });
});

document.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const action = actions[button.dataset.action || ''];
  if (action) void runAction(button, action);
});

function initializeProvider() {
  const available = Boolean(window.scopuly?.isScopuly);
  setProviderAvailable(available);
  if (!available) return false;

  window.scopuly?.onChange((event) => {
    log(`Provider change event: ${String(event.changed || 'state updated')}.`);
    void refreshConnection().catch((error) => {
      log(`Could not refresh after provider change: ${providerError(error).message}`, 'error');
    });
  });
  void refreshConnection().catch((error) => {
    log(`Initial provider refresh failed: ${providerError(error).message}`, 'error');
  });
  return true;
}

window.addEventListener('scopuly#initialized', () => {
  if (initializeProvider()) log('Scopuly provider initialized.', 'success');
});

if (!initializeProvider()) {
  let attempts = 0;
  const detectionTimer = window.setInterval(() => {
    attempts += 1;
    if (initializeProvider() || attempts >= 20) window.clearInterval(detectionTimer);
  }, 500);
}

selectNetwork(Networks.PUBLIC, false);
void revealPlayground();
