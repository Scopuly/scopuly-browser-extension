import './styles.css';
import { formatOrigin, shortAddress } from '../shared/format';
import {
  NETWORKS,
  type ExtensionSettings,
  type PendingRequest,
  type WalletState
} from '../shared/types';
import { api } from './api';
import {
  actionButton,
  appHeader,
  authEntryReviewPanel,
  iconButton,
  inlineAlert,
  messageReviewPanel,
  originSecurityPanel,
  reviewPanel,
  riskBadge,
  statusChip,
  statusHero
} from './components';
import { button, el, mount, safeAction, setTheme, showToast } from './dom';
import { icon } from './icons';
import { requestNetwork, requestTitle, type StatusPresentation } from './presentation';
import { siteAvatar } from './site-avatar';
import { createStellarIdenticon } from './stellar-identicon';

const params = new URLSearchParams(location.search);
const requestId = params.get('requestId') || '';
let state: WalletState;
let settings: ExtensionSettings;
let request: PendingRequest | null;
let pollTimer: number | undefined;
let pollInFlight = false;
let lastRenderKey = '';

function visibleStateKey() {
  const stableRequest = request
    ? Object.fromEntries(
        Object.entries(request).filter(([key]) => !['updatedAt', 'mobilePollAttempt'].includes(key))
      )
    : null;
  const visibleAccount = state.mobileAccounts.find((item) => item.id === request?.accountId);

  return JSON.stringify({
    theme: state.theme,
    account: visibleAccount
      ? {
          id: visibleAccount.id,
          publicKey: visibleAccount.publicKey,
          name: visibleAccount.name,
          supportedNetworks: visibleAccount.supportedNetworks
        }
      : null,
    showAdvancedReview: settings.showAdvancedReview,
    request: stableRequest
  });
}

async function closeWindow() {
  if (pollTimer) window.clearInterval(pollTimer);
  if (request && ['completed', 'rejected', 'expired', 'failed'].includes(request.status)) {
    await api.dismissPendingRequest(requestId).catch(() => undefined);
  }
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow.id !== undefined) {
      await chrome.windows.remove(currentWindow.id);
      return;
    }
  } catch (_error) {
    // Fall through to the DOM close for browsers without promise-based windows APIs.
  }
  window.close();
}

async function closeRequestWindow() {
  if (request?.kind === 'connect' && request.status === 'awaitingApproval') {
    await api.rejectRequest(requestId, 'Connection request closed in the browser.');
  }
  await closeWindow();
}

async function refresh(useTransport = false) {
  [state, settings, request] = await Promise.all([
    api.getState(),
    api.getSettings(),
    useTransport ? api.refreshPendingRequest(requestId) : api.getPendingRequest(requestId)
  ]);
  setTheme(state.theme);
  const nextRenderKey = visibleStateKey();
  if (nextRenderKey !== lastRenderKey) {
    lastRenderKey = nextRenderKey;
    render();
  }
  managePolling();
}

function requestHeader() {
  const header = el('section', 'request-header-card');
  const label = request?.appName || formatOrigin(request?.origin || '');
  const identity = el('div', 'request-site');
  identity.append(
    siteAvatar(request?.origin || '', label, 'large', request?.icon),
    el('div', '', '')
  );
  const copy = identity.lastElementChild!;
  copy.append(
    el('small', '', request ? requestTitle(request).toUpperCase() : 'SCOPULY REQUEST'),
    el('h1', '', label),
    el('p', '', formatOrigin(request?.origin || ''))
  );
  header.appendChild(identity);
  if (request?.review?.risk && request.review.risk !== 'low') {
    header.appendChild(riskBadge(request.review.risk));
  }
  return header;
}

function originSummary() {
  const group = el('section', 'panel request-origin-group');
  group.append(requestHeader(), originSecurityPanel(request?.originRisk));
  return group;
}

function accountSummary() {
  const account = state.mobileAccounts.find((item) => item.id === request?.accountId);
  const networkId = request ? requestNetwork(request) : undefined;
  const row = el('section', 'panel request-account');
  const accountIcon = createStellarIdenticon(account?.publicKey || request?.publicKey || '', 44);
  accountIcon.classList.add('device-icon');
  const copy = el('div', 'request-account-copy');
  copy.append(
    el('small', '', request?.kind === 'connect' ? 'PUBLIC ACCOUNT TO SHARE' : 'MOBILE SIGNING ACCOUNT'),
    el('b', '', account?.name || 'Scopuly Mobile'),
    el('span', 'mono', shortAddress(account?.publicKey || request?.publicKey || '', 7))
  );
  const meta = el('div', 'request-account-meta');
  if (networkId) meta.appendChild(statusChip(NETWORKS[networkId].label, 'neutral', 'network'));
  meta.appendChild(statusChip('Mobile', 'neutral', 'phone'));
  row.append(accountIcon, copy, meta);
  return row;
}

function connectRequest(app: HTMLElement) {
  const group = el('section', 'panel request-context connect-request-context');
  const panel = el('section', 'connect-permission');
  const symbol = el('span', 'permission-symbol');
  symbol.appendChild(icon('link', 22));
  const copy = el('div');
  copy.append(
    el('h2', '', 'Share this public address?'),
    el(
      'p',
      '',
      'This website can read the selected Stellar address. It cannot sign transactions without a separate approval in Scopuly Mobile.'
    )
  );
  panel.append(symbol, copy);
  group.append(panel, accountSummary());
  app.appendChild(group);
}

function requestStatusPresentation(): StatusPresentation {
  const status = request?.status;
  if (status === 'awaitingMobile') {
    const pushFailure = request?.mobilePushStatus
      && !['accepted', 'already-pending'].includes(request.mobilePushStatus);
    const pushDescription = request?.mobilePushStatus === 'not-registered'
      ? 'Scopuly Mobile has no push token for this session. Open the app and enable notifications, then request again.'
      : request?.mobilePushStatus === 'invalid-registration'
        ? 'The saved mobile push token is no longer valid. Open Scopuly and enable notifications again.'
        : 'The server could not send the mobile push. The encrypted request remains pending and can still be opened in Scopuly.';

    return {
      title: 'Review on your phone',
      description: pushFailure
        ? pushDescription
        : request?.lastTransportError
        ? 'The bridge is reconnecting automatically. Your request remains encrypted and pending.'
        : 'Open Scopuly Mobile to review and approve or reject this exact request.',
      label: pushFailure
        ? 'Push unavailable'
        : request?.lastTransportError ? 'Reconnecting' : 'Waiting for mobile',
      tone: pushFailure || request?.lastTransportError ? 'warning' : 'neutral',
      icon: pushFailure ? 'warning' : request?.lastTransportError ? 'refresh' : 'radio'
    };
  }
  if (status === 'completed') {
    return {
      title: request?.submit ? 'Signed and submitted' : 'Request approved',
      description: 'Scopuly verified the mobile result before returning it to the requesting website.',
      label: 'Verified result',
      tone: 'success',
      icon: 'radio'
    };
  }
  if (status === 'rejected') {
    return {
      title: 'Rejected on mobile',
      description: request?.error || 'The request was rejected in Scopuly Mobile.',
      label: 'Not approved',
      tone: 'danger',
      icon: 'warning'
    };
  }
  if (status === 'expired') {
    return {
      title: 'Request expired',
      description: 'No result was accepted after the five-minute request window.',
      label: 'Expired safely',
      tone: 'warning',
      icon: 'warning'
    };
  }
  return {
    title: 'Request could not be completed',
    description: request?.error || 'The mobile signing request failed.',
    label: 'Action required',
    tone: 'danger',
    icon: 'warning'
  };
}

function mobileStatusPanel() {
  const panel = statusHero(requestStatusPresentation());
  panel.classList.add('mobile-request-status', `status-${request?.status || 'unknown'}`);
  return panel;
}

function mobileRequestContext() {
  const group = el('section', 'panel request-context');
  group.append(mobileStatusPanel(), accountSummary());
  return group;
}

function successResult() {
  if (!request?.result || !request.submit || !('hash' in request.result)) return null;
  const result = el('section', 'panel verified-result');
  const heading = el('div', 'verified-result-title');
  const symbol = el('span');
  symbol.appendChild(icon('check', 20));
  heading.append(symbol, el('div', '', ''));
  const copy = heading.lastElementChild!;
  copy.append(el('small', '', 'VERIFIED TRANSACTION HASH'), el('b', 'mono', shortAddress(request.result.hash, 10)));
  const open = actionButton('View on Explorer', 'external', 'btn outline compact', () => {
    const networkId = request ? requestNetwork(request) : undefined;
    const base = networkId === 'public'
      ? 'https://stellar.expert/explorer/public/tx/'
      : 'https://stellar.expert/explorer/testnet/tx/';
    void chrome.tabs.create({ url: `${base}${request?.result && 'hash' in request.result ? request.result.hash : ''}` });
  });
  result.append(heading, open);
  return result;
}

function actions() {
  const footer = el('footer', 'confirm-actions');
  if (request?.kind === 'connect' && request.status === 'awaitingApproval') {
    const reject = button('Reject', 'btn ghost danger-text');
    reject.addEventListener('click', () => safeAction(reject, async () => {
      await api.rejectRequest(requestId);
      await closeWindow();
    }));
    const connect = actionButton('Connect site', 'link', 'btn primary');
    connect.addEventListener('click', () => safeAction(connect, async () => {
      await api.approveRequest(requestId);
      await closeWindow();
    }));
    footer.append(reject, connect);
    return footer;
  }

  if (request?.status === 'awaitingMobile') {
    const cancel = button('Cancel request', 'btn ghost danger-text full-width');
    cancel.addEventListener('click', () => safeAction(cancel, async () => {
      await api.rejectRequest(requestId, 'Request cancelled in the browser.');
      await closeWindow();
    }));
    footer.append(cancel);
    return footer;
  }

  if (request?.status === 'failed') {
    const close = button('Close', 'btn ghost', closeWindow);
    const retry = actionButton('Retry mobile request', 'refresh', 'btn primary');
    retry.addEventListener('click', () => safeAction(retry, async () => {
      await api.sendRequestToMobile(requestId);
      showToast('Request sent to Scopuly Mobile', 'success');
      await refresh(true);
    }));
    footer.append(close, retry);
    return footer;
  }

  footer.appendChild(button('Close', 'btn primary full-width', closeWindow));
  return footer;
}

function managePolling() {
  const shouldPoll = request?.status === 'awaitingMobile';
  if (!shouldPoll && pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
    return;
  }
  if (shouldPoll && !pollTimer) {
    pollTimer = window.setInterval(async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        await refresh(true);
      } catch (_error) {
        // The next poll retries transient extension or bridge failures.
      } finally {
        pollInFlight = false;
      }
    }, 1500);
  }
}

function render() {
  const app = el('main', 'confirm-app');
  const header = appHeader({ state });
  header.querySelector('.header-actions')?.appendChild(
    iconButton('Close request window', 'x', closeRequestWindow)
  );
  app.appendChild(header);

  if (!request) {
    app.append(
      inlineAlert('Request no longer active', 'This Scopuly request has already been consumed or removed.', 'neutral'),
      button('Close', 'btn primary full-width', closeWindow)
    );
    mount('confirm-root', app);
    return;
  }

  app.appendChild(originSummary());

  if (request.kind === 'connect') {
    connectRequest(app);
  } else {
    app.appendChild(mobileRequestContext());
    if (request.kind === 'signMessage') {
      app.appendChild(messageReviewPanel(request.messageReview));
    } else if (request.kind === 'signAuthEntry') {
      app.appendChild(authEntryReviewPanel(request.authEntryReview));
    } else {
      app.appendChild(reviewPanel(request.review, settings.showAdvancedReview));
    }
    const result = successResult();
    if (result) app.appendChild(result);
  }

  app.appendChild(actions());
  mount('confirm-root', app);
}

refresh().catch((error) => {
  const app = el('main', 'confirm-app');
  app.append(
    appHeader(),
    inlineAlert('Request could not be loaded', error instanceof Error ? error.message : String(error), 'danger'),
    button('Close', 'btn primary full-width', closeWindow)
  );
  mount('confirm-root', app);
});
