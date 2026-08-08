import './styles.css';
import { NETWORKS, type NetworkId, type WalletState } from '../shared/types';
import { shortAddress } from '../shared/format';
import { api } from './api';
import {
  accountCard,
  actionButton,
  appHeader,
  bridgeStatusHero,
  confirmDialog,
  dappRow,
  emptyState,
  iconButton,
  inlineAlert,
  mobileAccountRow,
  sectionHeading,
  statusChip
} from './components';
import { button, copyText, el, mount, safeAction, setTheme, showToast } from './dom';
import { icon } from './icons';
import {
  bridgeHealthPresentation,
  formatRelativeTime,
  groupAccountsBySession
} from './presentation';
import { siteAvatar } from './site-avatar';
import { renderBrandedQr } from './branded-qr';

type PopupView = 'home' | 'accounts' | 'dapps' | 'dapp';

let state: WalletState;
let view: PopupView = 'home';
let selectedOrigin = '';
let pairingPoll: number | undefined;
let pairingPollInFlight = false;
let initialHealthCheckStarted = false;
let pairingFailure: { title: string; message: string } | null = null;

async function refresh() {
  state = await api.getState();
  setTheme(state.theme);
  if (!state.initialized) view = 'home';
  render();
  managePairingPolling();

  if (state.initialized && !initialHealthCheckStarted) {
    initialHealthCheckStarted = true;
    void api.refreshSessionHealth().then((nextState) => {
      state = nextState;
      render();
    }).catch(() => undefined);
  }
}

function navigate(next: PopupView, origin = '') {
  view = next;
  selectedOrigin = origin;
  render();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

async function toggleTheme() {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  try {
    state = await api.setTheme(nextTheme);
    setTheme(state.theme);
    render();
    showToast(`${nextTheme === 'light' ? 'Light' : 'Dark'} theme enabled`, 'success');
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'danger');
  }
}

function shell(title?: string, subtitle?: string) {
  const app = el('main', 'wallet-app');
  app.appendChild(appHeader({
    state,
    title,
    subtitle,
    onBack: view === 'home' ? undefined : () => navigate('home'),
    onTheme: toggleTheme,
    onSettings: () => chrome.runtime.openOptionsPage()
  }));
  return app;
}

function pairingStep(number: string, title: string, description: string) {
  const row = el('div', 'pairing-step');
  const symbol = el('span', 'step-number', number);
  const copy = el('div', 'step-copy');
  copy.append(el('b', '', title), el('small', '', description));
  row.append(symbol, copy);
  return row;
}

function trustFact(iconName: 'lock' | 'shield-check' | 'phone', title: string, text: string) {
  const item = el('div', 'trust-fact');
  const symbol = el('span');
  symbol.appendChild(icon(iconName, 18));
  const copy = el('div');
  copy.append(el('b', '', title), el('small', '', text));
  item.append(symbol, copy);
  return item;
}

function legacyWalletNotice(app: HTMLElement) {
  if (!state.legacyWalletPresent) return;
  const panel = el('section', 'panel');
  panel.appendChild(inlineAlert(
    'Legacy local signer data detected',
    'This encrypted browser wallet is no longer used. Scopuly Mobile is the only production signer.',
    'warning'
  ));
  const remove = actionButton('Remove legacy wallet data', 'trash', 'btn danger full-width');
  remove.addEventListener('click', async () => {
    const approved = await confirmDialog(
      'Permanently remove legacy wallet data?',
      'This deletes the old encrypted secret, salt and recovery metadata from this browser. This cannot be undone.',
      'Remove legacy data',
      'danger'
    );
    if (!approved) return;
    await safeAction(remove, async () => {
      state = await api.removeLegacyWallet();
      showToast('Legacy wallet data removed', 'success');
      render();
    });
  });
  panel.appendChild(remove);
  app.appendChild(panel);
}

function onboarding(app: HTMLElement) {
  const hero = el('section', 'onboarding-hero');
  const coin = el('img', 'hero-coin') as HTMLImageElement;
  coin.src = 'brand/scopuly-coin-192.png';
  coin.alt = '';
  const label = statusChip('SCOPULY MOBILE SIGNER', 'neutral');
  const copy = el('div', 'onboarding-copy');
  copy.append(
    label,
    el('h1', '', 'Sign on your phone. Explore on desktop.'),
    el('p', '', 'Connect Stellar dApps while your keys and final approval stay in Scopuly Mobile.')
  );
  hero.append(coin, copy);
  app.appendChild(hero);

  if (pairingFailure) {
    app.appendChild(inlineAlert(
      pairingFailure.title,
      pairingFailure.message,
      'warning'
    ));
  }

  const setup = el('section', 'panel onboarding-setup');
  setup.append(
    sectionHeading('Connect in three steps', 'Pair once with an encrypted, short-lived QR code.'),
    pairingStep('1', 'Open Scopuly Mobile', 'Unlock the wallet you want to use with desktop dApps.'),
    pairingStep('2', 'Open the scanner', 'Scan the QR code shown by this extension.'),
    pairingStep('3', 'Confirm the browser', 'Choose the public accounts you want to make available.')
  );

  const connect = actionButton(
    pairingFailure ? 'Generate new QR' : 'Connect Scopuly Mobile',
    'scan',
    'btn primary full-width'
  );
  connect.disabled = !state.transportConfigured;
  connect.addEventListener('click', () => safeAction(connect, async () => {
    pairingFailure = null;
    await api.startPairing();
    await refresh();
  }));
  setup.appendChild(connect);
  app.appendChild(setup);

  const trust = el('section', 'trust-grid');
  trust.append(
    trustFact('lock', 'No keys in the extension', 'Secret keys and seed phrases never enter the browser.'),
    trustFact('shield-check', 'Encrypted pairing', 'Account metadata and requests stay end-to-end encrypted.'),
    trustFact('phone', 'Mobile approval', 'Your phone remains the final signer for every sensitive request.')
  );
  app.appendChild(trust);

  if (!state.transportConfigured) {
    app.appendChild(inlineAlert(
      'Bridge configuration required',
      'This development build does not include a Scopuly Bridge endpoint.',
      'warning'
    ));
  }
}

async function pairing(app: HTMLElement) {
  const current = state.pairing!;
  const panel = el('section', 'pairing-panel');
  panel.append(
    statusChip('ENCRYPTED PAIRING', 'neutral', 'lock'),
    el('h1', '', 'Scan with Scopuly Mobile'),
    el('p', '', 'Open the scanner in the mobile app and confirm this browser.')
  );
  if (pairingFailure) {
    panel.appendChild(inlineAlert(pairingFailure.title, pairingFailure.message, 'warning'));
  }

  const qrWrap = el('div', 'qr-wrap');
  const qr = el('img', 'pairing-qr') as HTMLImageElement;
  qr.alt = 'Scopuly Mobile pairing QR code';
  qr.src = await renderBrandedQr(current.uri);
  qrWrap.appendChild(qr);
  panel.appendChild(qrWrap);

  const seconds = pairingSeconds(current.expiresAt);
  const progress = el('div', 'pairing-progress');
  const progressBar = el('span');
  progressBar.style.width = `${Math.max(0, Math.min(100, (seconds / 120) * 100))}%`;
  progress.appendChild(progressBar);
  panel.append(
    el('div', 'pairing-status', pairingStatusText(seconds)),
    progress
  );

  const actions = el('div', 'action-row pairing-actions');
  actions.append(
    actionButton('Copy link', 'copy', 'btn secondary', () => copyText(current.uri, 'Pairing link copied')),
    button('Cancel', 'btn ghost danger-text', async () => {
      await api.cancelPairing();
      pairingFailure = null;
      await refresh();
    })
  );
  panel.appendChild(actions);
  app.appendChild(panel);

  const note = el('div', 'privacy-note');
  note.append(
    icon('shield-check', 17),
    el('span', '', 'The relay only sees routing metadata. Account data and signing requests remain encrypted.')
  );
  app.appendChild(note);
}

function pairingSeconds(expiresAt: number) {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

function pairingStatusText(seconds: number) {
  return `Waiting for mobile · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function updatePairingCountdown() {
  if (!state.pairing) return;
  const seconds = pairingSeconds(state.pairing.expiresAt);
  const status = document.querySelector<HTMLElement>('.pairing-status');
  const progress = document.querySelector<HTMLElement>('.pairing-progress span');
  if (status) status.textContent = pairingStatusText(seconds);
  if (progress) {
    progress.style.width = `${Math.max(0, Math.min(100, (seconds / 120) * 100))}%`;
  }
}

function openExplorer(publicKey: string, networkId: NetworkId = state.networkId) {
  const base = networkId === 'public'
    ? 'https://stellar.expert/explorer/public/account/'
    : 'https://stellar.expert/explorer/testnet/account/';
  void chrome.tabs.create({ url: `${base}${publicKey}` });
}

function openNetworkDialog() {
  const dialog = el('dialog', 'modal-dialog network-dialog') as HTMLDialogElement;
  const card = el('div', 'modal-card');
  const copy = el('div', 'modal-copy');
  copy.append(
    el('h2', '', 'Default Stellar network'),
    el('p', '', 'Used only when a new dApp request does not specify its own network.')
  );
  const choices = el('div', 'network-choices');
  (Object.keys(NETWORKS) as NetworkId[]).forEach((networkId) => {
    const active = state.networkId === networkId;
    const choice = button('', `network-choice${active ? ' active' : ''}`);
    const text = el('span');
    text.append(
      el('b', '', NETWORKS[networkId].label),
      el('small', '', networkId === 'public' ? 'Live Stellar network' : 'Developer testing network')
    );
    choice.append(el('span', 'network-signal'), text, active ? icon('check', 18) : icon('chevron-right', 18));
    choice.addEventListener('click', () => safeAction(choice, async () => {
      state = await api.setNetwork(networkId);
      dialog.close();
      dialog.remove();
      showToast(`Default network: ${NETWORKS[networkId].label}`, 'success');
      render();
    }));
    choices.appendChild(choice);
  });
  const close = button('Close', 'btn ghost full-width', () => dialog.close());
  card.append(copy, choices, close);
  dialog.appendChild(card);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.showModal();
}

function statusAction() {
  if (state.bridgeHealth.status === 'healthy') return undefined;
  if (['reconnect-required', 'incompatible'].includes(state.bridgeHealth.status)) {
    const reconnect = actionButton('Reconnect', 'refresh', 'btn compact light-on-status');
    reconnect.addEventListener('click', () => safeAction(reconnect, async () => {
      await api.startPairing();
      await refresh();
    }));
    return reconnect;
  }
  const check = actionButton('Check', 'refresh', 'btn compact light-on-status');
  check.addEventListener('click', () => safeAction(check, async () => {
    state = await api.refreshSessionHealth();
    showToast(
      state.bridgeHealth.status === 'healthy' ? 'Secure session verified' : 'Session status updated',
      state.bridgeHealth.status === 'healthy' ? 'success' : 'warning'
    );
    render();
  }));
  return check;
}

function dappPreview() {
  const panel = el('section', 'panel dapp-panel');
  const viewAll = state.connections.length
    ? button('View all', 'text-button', () => navigate('dapps'))
    : undefined;
  panel.appendChild(sectionHeading(
    'Connected dApps',
    'Public account access you approved.',
    viewAll
  ));
  if (!state.connections.length) {
    panel.appendChild(emptyState(
      'No dApps connected yet',
      'A website appears here after you approve access to a mobile account.',
      'link'
    ));
    return panel;
  }
  const list = el('div', 'dapp-list');
  state.connections.slice(0, 2).forEach((connection) => {
    const account = state.mobileAccounts.find((item) => item.id === connection.accountId);
    list.appendChild(dappRow(connection, account, (origin) => navigate('dapp', origin)));
  });
  panel.appendChild(list);
  return panel;
}

async function activateMobileAccount(accountId: string, accountName: string) {
  try {
    state = await api.selectMobileAccount(accountId);
    showToast(`${accountName} is now active`, 'success');
    render();
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'danger');
  }
}

function accountPreview() {
  if (state.mobileAccounts.length < 2) return null;
  const panel = el('section', 'panel home-accounts-panel');
  panel.appendChild(sectionHeading(
    'Mobile accounts',
    `${state.mobileAccounts.length} public accounts available.`,
    button('Manage', 'text-button', () => navigate('accounts'))
  ));
  const list = el('div', 'mobile-account-list home-account-list');
  state.mobileAccounts.slice(0, 3).forEach((mobileAccount) => {
    list.appendChild(mobileAccountRow(
      mobileAccount,
      mobileAccount.id === state.selectedAccountId,
      (accountId) => activateMobileAccount(accountId, mobileAccount.name)
    ));
  });
  panel.appendChild(list);
  if (state.mobileAccounts.length > 3) {
    panel.appendChild(button(
      `View all ${state.mobileAccounts.length} accounts`,
      'btn ghost compact full-width',
      () => navigate('accounts')
    ));
  }
  return panel;
}

function home(app: HTMLElement) {
  app.appendChild(bridgeStatusHero(state, statusAction()));
  app.appendChild(accountCard(state, openNetworkDialog, () => navigate('accounts')));

  const account = state.mobileAccounts.find((item) => item.id === state.selectedAccountId)
    || state.mobileAccounts[0];
  const actions = el('div', 'quick-actions');
  actions.append(
    actionButton('Copy address', 'copy', 'quick-action', () => copyText(account?.publicKey || '', 'Address copied')),
    actionButton('View on Explorer', 'external', 'quick-action', () => openExplorer(account?.publicKey || ''))
  );
  app.appendChild(actions);
  const accounts = accountPreview();
  if (accounts) app.appendChild(accounts);
  app.appendChild(dappPreview());

  const boundary = el('section', 'signer-boundary');
  const symbol = el('span');
  symbol.appendChild(icon('shield-check', 20));
  const copy = el('div');
  copy.append(
    el('b', '', 'Your phone is the final signer'),
    el('p', '', 'Every sensitive dApp request is independently reviewed and approved in Scopuly Mobile.')
  );
  boundary.append(symbol, copy);
  app.appendChild(boundary);

  const footer = el('footer', 'app-footer');
  footer.append(
    button('Mobile accounts', 'text-button', () => navigate('accounts')),
    el('span', '', `Version ${chrome.runtime.getManifest().version}`)
  );
  app.appendChild(footer);
}

function accounts(app: HTMLElement) {
  const add = actionButton('Pair another device', 'plus', 'btn outline compact');
  add.addEventListener('click', () => safeAction(add, async () => {
    await api.startPairing();
    await refresh();
  }));
  app.appendChild(sectionHeading(
    'Mobile accounts',
    'Choose the account that new dApps will use.',
    add
  ));

  const groups = groupAccountsBySession(state.mobileAccounts, state.mobileSessions);
  groups.forEach(({ session, accounts: sessionAccounts }) => {
    const sessionPanel = el('section', 'panel session-panel');
    const device = sessionAccounts[0]?.device;
    const head = el('div', 'session-head');
    const label = el('div', 'session-title');
    const symbol = el('span', 'session-icon');
    symbol.appendChild(icon('phone', 20));
    const copy = el('div');
    const sessionHealth = bridgeHealthPresentation(session.health?.status || 'unchecked');
    copy.append(
      el('h2', '', device?.name || 'Scopuly Mobile'),
      el('p', '', `${device?.platform?.toUpperCase() || 'MOBILE'} · checked ${formatRelativeTime(session.health?.checkedAt || session.lastSeenAt)}`)
    );
    label.append(symbol, copy);
    head.append(label, statusChip(sessionHealth.label, sessionHealth.tone));
    sessionPanel.appendChild(head);

    const list = el('div', 'mobile-account-list');
    sessionAccounts.forEach((account) => {
      list.appendChild(mobileAccountRow(
        account,
        account.id === state.selectedAccountId,
        (accountId) => activateMobileAccount(accountId, account.name),
        (publicKey) => void copyText(publicKey, 'Address copied')
      ));
    });
    sessionPanel.appendChild(list);

    const disconnect = actionButton('Disconnect device', 'trash', 'btn ghost compact danger-text');
    disconnect.addEventListener('click', async () => {
      const approved = await confirmDialog(
        'Disconnect this device?',
        `This removes ${sessionAccounts.length} account${sessionAccounts.length === 1 ? '' : 's'} and disconnects dApps assigned to this mobile session.`,
        'Disconnect device',
        'danger'
      );
      if (!approved) return;
      await safeAction(disconnect, async () => {
        state = await api.disconnectMobileSession(session.id);
        showToast('Mobile session disconnected', 'success');
        if (!state.initialized) navigate('home');
        else render();
      });
    });
    const foot = el('div', 'session-footer');
    foot.append(
      el('span', '', `Protocol ${session.protocolVersion || '1.0'}`),
      disconnect
    );
    sessionPanel.appendChild(foot);
    app.appendChild(sessionPanel);
  });
}

function dapps(app: HTMLElement) {
  app.appendChild(sectionHeading(
    'Connected dApps',
    'Review which websites can see each paired public address.'
  ));
  if (!state.connections.length) {
    app.appendChild(emptyState(
      'No dApps connected yet',
      'Scopuly asks before sharing a public account with any website.',
      'link'
    ));
    return;
  }
  const panel = el('section', 'panel dapp-panel full-list');
  const list = el('div', 'dapp-list');
  state.connections.forEach((connection) => {
    const account = state.mobileAccounts.find((item) => item.id === connection.accountId);
    list.appendChild(dappRow(connection, account, (origin) => navigate('dapp', origin)));
  });
  panel.appendChild(list);
  app.appendChild(panel);
}

function dappDetails(app: HTMLElement) {
  const connection = state.connections.find((item) => item.origin === selectedOrigin);
  if (!connection) {
    app.appendChild(emptyState('Connection not found', 'This dApp is no longer connected.', 'link'));
    return;
  }
  const account = state.mobileAccounts.find((item) => item.id === connection.accountId);
  const hero = el('section', 'dapp-detail-hero');
  hero.append(
    siteAvatar(connection.origin, connection.name, 'large', connection.icon),
    el('h1', '', connection.name || connection.origin),
    el('p', '', connection.origin),
    statusChip('Connected', 'success')
  );
  app.appendChild(hero);

  const details = el('section', 'panel detail-list');
  const rows: Array<[string, string, boolean?]> = [
    ['Shared account', account?.name || 'Unavailable'],
    ['Public address', shortAddress(connection.publicKey || '', 8), true],
    ['Connected', new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(connection.connectedAt)],
    ['Last request', formatRelativeTime(connection.lastUsedAt)]
  ];
  rows.forEach(([label, value, mono]) => {
    const row = el('div', 'detail-row');
    row.append(el('span', '', label), el('b', mono ? 'mono' : '', value));
    details.appendChild(row);
  });
  app.appendChild(details);

  const boundary = inlineAlert(
    'Permission granted',
    'This website can read only the public address above. Every sensitive request still requires Scopuly Mobile.',
    'neutral'
  );
  app.appendChild(boundary);

  const disconnect = actionButton('Disconnect dApp', 'trash', 'btn danger full-width');
  disconnect.addEventListener('click', async () => {
    const approved = await confirmDialog(
      'Disconnect this dApp?',
      `${connection.origin} will need to request account access again.`,
      'Disconnect dApp',
      'danger'
    );
    if (!approved) return;
    await safeAction(disconnect, async () => {
      state = await api.disconnectOrigin(connection.origin);
      showToast('dApp disconnected', 'success');
      navigate('dapps');
    });
  });
  app.appendChild(disconnect);
}

function managePairingPolling() {
  if (!state.pairing || pairingPoll) {
    if (!state.pairing && pairingPoll) {
      window.clearInterval(pairingPoll);
      pairingPoll = undefined;
      pairingPollInFlight = false;
    }
    return;
  }

  pairingPoll = window.setInterval(async () => {
    updatePairingCountdown();
    if (pairingPollInFlight) return;
    pairingPollInFlight = true;
    try {
      const result = await api.refreshPairing();
      if (result.pairing.status === 'approved') {
        pairingFailure = null;
        await refresh();
      } else if (result.pairing.status !== 'pending') {
        window.clearInterval(pairingPoll);
        pairingPoll = undefined;
        pairingFailure = {
          title: result.pairing.status === 'expired' ? 'Pairing QR expired' : 'Pairing could not be completed',
          message: result.pairing.error || 'Generate a fresh encrypted QR code and try again.'
        };
        state = await api.getState();
        render();
      } else {
        if (pairingFailure) {
          pairingFailure = null;
          render();
        }
        state = { ...state, pairing: result.pairing };
        updatePairingCountdown();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (pairingFailure?.message !== message) {
        pairingFailure = {
          title: 'Bridge temporarily unavailable',
          message
        };
        render();
      }
    } finally {
      pairingPollInFlight = false;
    }
  }, 1000);
}

function render() {
  const titles: Record<Exclude<PopupView, 'home'>, [string, string]> = {
    accounts: ['Mobile accounts', 'Paired devices and public accounts'],
    dapps: ['Connected dApps', 'Website access'],
    dapp: ['dApp details', 'Website permission']
  };
  const title = view === 'home' ? undefined : titles[view];
  const app = shell(title?.[0], title?.[1]);

  if (state.pairing) {
    void pairing(app).then(() => mount('popup-root', app));
    return;
  }
  if (!state.initialized) onboarding(app);
  else if (view === 'accounts') accounts(app);
  else if (view === 'dapps') dapps(app);
  else if (view === 'dapp') dappDetails(app);
  else home(app);
  legacyWalletNotice(app);
  mount('popup-root', app);
}

refresh().catch((error) => {
  const app = el('main', 'wallet-app');
  app.append(
    appHeader(),
    inlineAlert('Scopuly could not open', error instanceof Error ? error.message : String(error), 'danger')
  );
  mount('popup-root', app);
});
