import './styles.css';
import { Networks } from '@stellar/stellar-sdk';
import type { TransactionReview, WalletState } from '../shared/types';
import {
  accountCard,
  actionButton,
  appHeader,
  bridgeStatusHero,
  dappRow,
  emptyState,
  reviewPanel,
  statusChip,
  statusHero
} from './components';
import { button, el, mount, setTheme } from './dom';
import { renderBrandedQr } from './branded-qr';

const now = Date.now();
const publicKey = 'GBR5YUPPEJOWT5JH7H5C6BH67QHST5VB7E2PUN6RAYB25WQ65Q34EXAMPLE';
const fixtureState: WalletState = {
  initialized: true,
  locked: false,
  publicKey,
  walletName: 'Primary Account',
  networkId: 'public',
  theme: 'dark',
  connections: [
    {
      origin: 'https://aquarius.example',
      name: 'Aquarius',
      accountId: 'account-1',
      publicKey,
      connectedAt: now - 86_400_000,
      lastUsedAt: now - 120_000
    },
    {
      origin: 'https://blend.example',
      name: 'Blend',
      accountId: 'account-1',
      publicKey,
      connectedAt: now - 172_800_000,
      lastUsedAt: now - 3_600_000
    }
  ],
  policies: [],
  bridgeStatus: 'connected',
  bridgeHealth: { status: 'healthy', checkedAt: now },
  transportConfigured: true,
  mobileAccounts: [{
    id: 'account-1',
    sessionId: 'session-1',
    publicKey,
    name: 'Primary Account',
    supportedNetworks: ['public', 'testnet'],
    device: { id: 'device-1', name: 'Scopuly Mobile', platform: 'ios' },
    connectedAt: now - 86_400_000,
    lastSeenAt: now
  }],
  mobileSessions: [{
    id: 'session-1',
    transport: 'scopuly-bridge',
    status: 'connected',
    accountIds: ['account-1'],
    capabilities: ['signTransaction', 'signAndSubmitTransaction', 'signMessage', 'signAuthEntry'],
    createdAt: now - 86_400_000,
    expiresAt: now + 86_400_000,
    lastSeenAt: now,
    protocolVersion: '1.0'
  }],
  selectedAccountId: 'account-1',
  legacyWalletPresent: false
};

const transactionReview: TransactionReview = {
  ok: true,
  xdr: 'AAAAAgAAAAA...',
  networkPassphrase: Networks.PUBLIC,
  hash: '75a43824e0e69ad42a6a04433d236fb720bcf0b271eb02489137d21cf38beef1',
  source: publicKey,
  fee: '100',
  memo: 'None',
  timeBounds: '5 minutes',
  risk: 'medium',
  warnings: ['Confirm the destination and amount in Scopuly Mobile.'],
  operations: [{
    index: 0,
    type: 'payment',
    title: 'Send 10.00 XLM',
    description: 'To GASZ5E…J7B3Y3',
    risk: 'medium',
    asset: 'XLM',
    amount: '10.00'
  }]
};

function frame(title: string, width: number, content: HTMLElement) {
  const wrap = el('section', 'gallery-frame-wrap');
  wrap.appendChild(el('div', 'gallery-frame-label', `${title} · ${width}px`));
  const preview = el('div', 'gallery-frame');
  preview.style.width = `${width}px`;
  preview.appendChild(content);
  wrap.appendChild(preview);
  return wrap;
}

function dashboardPreview(width: number) {
  const app = el('main', 'wallet-app gallery-app');
  app.append(
    appHeader({ state: fixtureState }),
    bridgeStatusHero(fixtureState),
    accountCard(fixtureState, () => undefined, () => undefined)
  );
  const actions = el('div', 'quick-actions');
  actions.append(
    actionButton('Copy address', 'copy', 'quick-action'),
    actionButton('View on Explorer', 'external', 'quick-action')
  );
  app.appendChild(actions);
  const panel = el('section', 'panel dapp-panel');
  fixtureState.connections.forEach((connection) => {
    panel.appendChild(dappRow(connection, fixtureState.mobileAccounts[0]));
  });
  app.appendChild(panel);
  return frame('Connected dashboard', width, app);
}

function requestPreview() {
  const app = el('main', 'confirm-app gallery-app');
  app.append(
    appHeader({ state: fixtureState }),
    statusHero({
      title: 'Review on your phone',
      description: 'Open Scopuly Mobile to review and approve or reject this exact request.',
      label: 'Waiting for mobile',
      tone: 'neutral',
      icon: 'radio'
    }),
    reviewPanel(transactionReview)
  );
  return frame('Transaction request', 430, app);
}

function emptyPreview() {
  const app = el('main', 'wallet-app gallery-app');
  app.append(
    appHeader({ state: fixtureState }),
    emptyState(
      'No dApps connected yet',
      'A website appears here after you approve access to a mobile account.',
      'link'
    )
  );
  return frame('Compact empty state', 320, app);
}

async function pairingPreview() {
  const app = el('main', 'wallet-app gallery-app');
  app.appendChild(appHeader({ state: fixtureState }));
  const panel = el('section', 'pairing-panel');
  panel.append(
    statusChip('ENCRYPTED PAIRING', 'neutral', 'lock'),
    el('h1', '', 'Scan with Scopuly Mobile'),
    el('p', '', 'Open the scanner in the mobile app and confirm this browser.')
  );
  const qrWrap = el('div', 'qr-wrap');
  const qr = el('img', 'pairing-qr') as HTMLImageElement;
  qr.alt = 'Scopuly Mobile pairing QR code preview';
  qr.src = await renderBrandedQr(
    'scopuly://extension/pair?id=pairing-gallery-preview&ticket=galleryPreviewToken12345678901234567890123&v=1.0&epk=galleryPublicKey'
  );
  qrWrap.appendChild(qr);
  panel.append(qrWrap, el('div', 'pairing-status', 'Waiting for mobile · 1:45'));
  const actions = el('div', 'pairing-actions');
  actions.append(
    actionButton('Copy link', 'copy', 'btn secondary'),
    button('Cancel', 'btn ghost danger-text')
  );
  panel.appendChild(actions);
  app.appendChild(panel);
  return frame('Encrypted pairing', 390, app);
}

async function renderGallery() {
  const page = el('main', 'gallery-page');
  const heading = el('header', 'gallery-header');
  const copy = el('div');
  copy.append(el('small', '', 'NON-SHIPPING DESIGN HARNESS'), el('h1', '', 'Scopuly UI state gallery'));
  const theme = button('Toggle theme', 'btn outline', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    fixtureState.theme = next;
    void renderGallery();
  });
  heading.append(copy, theme);
  page.appendChild(heading);

  const grid = el('div', 'gallery-grid');
  grid.append(
    dashboardPreview(390),
    requestPreview(),
    emptyPreview(),
    await pairingPreview()
  );
  page.appendChild(grid);
  mount('gallery-root', page);
}

void renderGallery();
