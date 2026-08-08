import { formatOrigin, shortAddress } from '../shared/format';
import {
  NETWORKS,
  type AuthEntryReview,
  type MessageReview,
  type MobileAccount,
  type OriginConnection,
  type OriginRisk,
  type RiskLevel,
  type TransactionReview,
  type WalletState
} from '../shared/types';
import { button, el } from './dom';
import { icon, type IconName } from './icons';
import {
  bridgeHealthPresentation,
  formatRelativeTime,
  riskPresentation,
  type StatusPresentation,
  type StatusTone
} from './presentation';
import { siteAvatar } from './site-avatar';
import { createStellarIdenticon } from './stellar-identicon';

type HeaderOptions = {
  state?: WalletState;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  onTheme?: () => void;
  onSettings?: () => void;
};

export function iconButton(
  label: string,
  iconName: IconName,
  onClick?: () => void | Promise<void>,
  className = ''
) {
  const control = button('', `icon-btn${className ? ` ${className}` : ''}`, onClick);
  control.appendChild(icon(iconName, 19));
  control.setAttribute('aria-label', label);
  control.title = label;
  return control;
}

export function actionButton(
  label: string,
  iconName: IconName,
  className = 'btn secondary',
  onClick?: () => void | Promise<void>
) {
  const control = button('', className, onClick);
  control.append(icon(iconName, 18), el('span', '', label));
  return control;
}

export function appHeader(options: HeaderOptions = {}) {
  const header = el('header', 'app-header');
  if (options.onBack) {
    header.appendChild(iconButton('Go back', 'arrow-left', options.onBack));
  } else {
    const brand = el('div', 'app-brand');
    const wordmark = el('img', 'brand-wordmark') as HTMLImageElement;
    wordmark.src = options.state?.theme === 'light'
      ? 'brand/scopuly-wordmark-light.png'
      : 'brand/scopuly-wordmark-crop.png';
    wordmark.alt = 'Scopuly';
    brand.appendChild(wordmark);
    header.appendChild(brand);
  }

  if (options.title) {
    const heading = el('div', 'app-header-title');
    heading.append(el('b', '', options.title));
    if (options.subtitle) heading.append(el('small', '', options.subtitle));
    header.appendChild(heading);
  }

  const actions = el('div', 'header-actions');
  if (options.onTheme && options.state) {
    const switchingToLight = options.state.theme === 'dark';
    actions.appendChild(iconButton(
      switchingToLight ? 'Switch to light theme' : 'Switch to dark theme',
      switchingToLight ? 'sun' : 'moon',
      options.onTheme
    ));
  }
  if (options.onSettings) {
    actions.appendChild(iconButton('Security and settings', 'settings', options.onSettings));
  }
  header.appendChild(actions);
  return header;
}

export function brandHeader(state?: WalletState, onTheme?: () => void) {
  return appHeader({
    state,
    onTheme
  });
}

export function statusChip(label: string, tone: StatusTone = 'neutral', iconName?: IconName) {
  const chip = el('span', `status-chip status-${tone}`);
  if (iconName) chip.appendChild(icon(iconName, 13));
  chip.appendChild(el('span', '', label));
  return chip;
}

export function statusHero(
  presentation: StatusPresentation,
  action?: HTMLElement,
  detail?: string
) {
  const hero = el('section', `status-hero tone-${presentation.tone}`);
  const symbol = el('span', 'status-hero-icon');
  symbol.appendChild(icon(presentation.icon, 23));
  const copy = el('div', 'status-hero-copy');
  copy.append(
    statusChip(presentation.label, presentation.tone),
    el('h1', '', presentation.title),
    el('p', '', detail || presentation.description)
  );
  hero.append(symbol, copy);
  if (action) hero.appendChild(action);
  return hero;
}

export function bridgeStatusHero(state: WalletState, action?: HTMLElement) {
  return statusHero(
    bridgeHealthPresentation(state.bridgeHealth.status),
    action,
    state.bridgeHealth.message || undefined
  );
}

export function selectedMobileAccount(state: WalletState) {
  return state.mobileAccounts.find((account) => account.id === state.selectedAccountId)
    || state.mobileAccounts[0];
}

export function networkPill(state: WalletState, onClick?: () => void) {
  const control = button('', 'network-badge', onClick);
  control.append(
    el('span', 'network-signal'),
    el('span', '', NETWORKS[state.networkId].label),
    icon('chevron-right', 14)
  );
  control.setAttribute('aria-label', `Default network: ${NETWORKS[state.networkId].label}`);
  return control;
}

export function accountCard(
  state: WalletState,
  onNetwork?: () => void,
  onSwitch?: () => void
) {
  const account = selectedMobileAccount(state);
  const card = el('section', 'account-card premium-account-card');
  const top = el('div', 'account-card-top');
  const identicon = createStellarIdenticon(account?.publicKey || '', 50);
  identicon.classList.add('account-identicon');
  const identity = el('div', 'account-identity');
  identity.append(
    el('small', '', 'ACTIVE MOBILE ACCOUNT'),
    el('h2', '', account?.name || 'Scopuly Mobile')
  );
  top.append(identicon, identity);
  if (onSwitch) {
    top.appendChild(actionButton('Switch', 'switch', 'account-switch', onSwitch));
  }

  const address = el('div', 'account-address');
  address.append(
    el('span', 'mono', shortAddress(account?.publicKey || '', 8)),
    statusChip('Active', 'success')
  );
  const device = el('div', 'account-device');
  device.append(
    icon('phone', 16),
    el('span', '', account?.device.name || 'Scopuly Mobile')
  );
  card.append(top, networkPill(state, onNetwork), address, device);
  return card;
}

export function sectionHeading(title: string, description = '', action?: HTMLElement) {
  const row = el('div', 'section-heading');
  const copy = el('div');
  copy.appendChild(el('h2', '', title));
  if (description) copy.appendChild(el('p', '', description));
  row.appendChild(copy);
  if (action) row.appendChild(action);
  return row;
}

export function emptyState(
  title: string,
  description: string,
  iconName: IconName = 'link',
  action?: HTMLElement
) {
  const state = el('div', 'empty-state');
  const symbol = el('span', 'empty-state-icon');
  symbol.appendChild(icon(iconName, 25));
  state.append(symbol, el('h3', '', title), el('p', '', description));
  if (action) state.appendChild(action);
  return state;
}

export function inlineAlert(
  title: string,
  description: string,
  tone: StatusTone = 'warning',
  action?: HTMLElement
) {
  const notice = el('section', `inline-alert alert-${tone}`);
  const symbol = el('span', 'inline-alert-icon');
  symbol.appendChild(icon(tone === 'danger' || tone === 'warning' ? 'warning' : 'info', 19));
  const copy = el('div');
  copy.append(el('b', '', title), el('p', '', description));
  notice.append(symbol, copy);
  if (action) notice.appendChild(action);
  return notice;
}

export function mobileAccountRow(
  account: MobileAccount,
  selected: boolean,
  onSelect?: (accountId: string) => void,
  onCopy?: (publicKey: string) => void
) {
  const row = el('article', `mobile-account-row${selected ? ' selected' : ''}`);
  const deviceIcon = createStellarIdenticon(account.publicKey, 42);
  deviceIcon.classList.add('device-icon');
  const info = el('div', 'mobile-account-info');
  info.append(
    el('b', '', account.name),
    el('small', 'mono', shortAddress(account.publicKey, 7)),
    el('span', 'account-platform', `${account.device.name} · ${account.supportedNetworks.map((id) => NETWORKS[id].label).join(', ')}`)
  );
  const actions = el('div', 'row-actions');
  if (onCopy) actions.appendChild(iconButton('Copy address', 'copy', () => onCopy(account.publicKey), 'subtle'));
  if (selected) {
    actions.appendChild(statusChip('Active', 'success'));
  } else if (onSelect) {
    actions.appendChild(button('Use', 'btn outline compact', () => onSelect(account.id)));
  }
  row.append(deviceIcon, info, actions);
  return row;
}

export function dappRow(
  connection: OriginConnection,
  account?: MobileAccount,
  onOpen?: (origin: string) => void
) {
  const control = button('', 'dapp-row', () => onOpen?.(connection.origin));
  const label = connection.name || formatOrigin(connection.origin);
  const copy = el('span', 'dapp-copy');
  copy.append(
    el('b', '', label),
    el('small', '', formatOrigin(connection.origin)),
    el('span', '', account ? `Account ${shortAddress(account.publicKey, 4)}` : 'Account unavailable')
  );
  const meta = el('span', 'dapp-meta');
  meta.append(
    statusChip('Connected', 'success'),
    el('small', '', formatRelativeTime(connection.lastUsedAt)),
    icon('chevron-right', 16)
  );
  control.append(siteAvatar(connection.origin, label, 'small', connection.icon), copy, meta);
  return control;
}

export function connectionList(
  state: WalletState,
  onOpen?: (origin: string) => void,
  limit?: number
) {
  const wrap = el('section', 'panel dapp-panel');
  wrap.appendChild(sectionHeading('Connected dApps', 'Public account access you approved.'));
  if (!state.connections.length) {
    wrap.appendChild(emptyState(
      'No dApps connected yet',
      'A website appears here after you approve access to a mobile account.',
      'link'
    ));
    return wrap;
  }
  const list = el('div', 'dapp-list');
  state.connections.slice(0, limit).forEach((connection) => {
    const account = state.mobileAccounts.find((item) => item.id === connection.accountId);
    list.appendChild(dappRow(connection, account, onOpen));
  });
  wrap.appendChild(list);
  return wrap;
}

export function riskBadge(risk: RiskLevel = 'low') {
  const presentation = riskPresentation(risk);
  return statusChip(presentation.label, presentation.tone, risk === 'low' ? 'shield-check' : 'warning');
}

export function originSecurityPanel(originRisk?: OriginRisk) {
  const panel = el('section', 'security-panel');
  if (!originRisk) {
    panel.appendChild(inlineAlert('Origin unavailable', 'No verified website origin metadata was provided.', 'warning'));
    return panel;
  }

  const head = el('div', 'security-head');
  const website = el('div', 'security-site');
  website.append(
    siteAvatar(originRisk.hostname, originRisk.hostname),
    el('span', '', '')
  );
  const copy = website.lastElementChild!;
  copy.append(el('small', '', 'Verified browser origin'), el('b', '', originRisk.hostname));
  head.appendChild(website);
  if (originRisk.level !== 'low') head.appendChild(riskBadge(originRisk.level));
  panel.appendChild(head);

  const list = el('div', 'security-list');
  originRisk.reasons.forEach((reason) => {
    const item = el('span');
    item.append(icon(originRisk.level === 'low' ? 'check' : 'warning', 15), el('span', '', reason));
    list.appendChild(item);
  });
  panel.appendChild(list);
  return panel;
}

function detail(label: string, value: string, mono = false) {
  const wrap = el('span', 'review-detail');
  wrap.append(el('small', '', label), el('b', mono ? 'mono' : '', value));
  return wrap;
}

export function reviewPanel(review?: TransactionReview, showAdvanced = false) {
  const panel = el('section', 'review-panel');
  panel.appendChild(sectionHeading('Transaction details', 'Decoded locally before mobile delivery.'));
  if (!review) {
    panel.appendChild(inlineAlert('Details unavailable', 'Transaction details could not be loaded.', 'warning'));
    return panel;
  }
  if (!review.ok) {
    panel.appendChild(inlineAlert('Unable to decode XDR', review.error || 'The transaction is invalid.', 'danger'));
    return panel;
  }

  const meta = el('div', 'review-meta');
  meta.append(
    detail('Fee', `${review.fee || '0'} stroops`),
    ...(review.feeBump
      ? [detail('Fee payer', shortAddress(review.feeSource || '', 6), true)]
      : []),
    detail('Memo', review.memo || 'None'),
    detail('Time bounds', review.timeBounds || 'None'),
    detail('Source', shortAddress(review.source || '', 6), true)
  );
  panel.appendChild(meta);

  if (review.warnings.length) {
    const warnings = el('div', 'warning-list');
    review.warnings.forEach((warning) => warnings.appendChild(inlineAlert('Review carefully', warning, 'warning')));
    panel.appendChild(warnings);
  }

  const list = el('div', 'op-list');
  review.operations.forEach((operation) => {
    const row = el('article', 'op-row');
    const index = el('span', 'op-index', String(operation.index + 1));
    const content = el('div', 'op-copy');
    content.append(
      el('small', '', operation.type),
      el('b', '', operation.title),
      el('p', '', operation.description)
    );
    row.append(index, content);
    if (operation.risk !== 'low') row.appendChild(riskBadge(operation.risk));
    list.appendChild(row);
  });
  panel.appendChild(list);

  if (showAdvanced) {
    const advanced = el('details', 'advanced-details');
    advanced.append(el('summary', '', 'Advanced XDR details'));
    const value = el('pre', 'message-preview');
    value.textContent = review.xdr;
    advanced.append(
      detail('Transaction hash', review.hash || 'Unavailable', true),
      value
    );
    panel.appendChild(advanced);
  }
  return panel;
}

export function messageReviewPanel(review?: MessageReview) {
  const panel = el('section', 'review-panel');
  panel.appendChild(sectionHeading('Message to sign', 'Verify this exact text in Scopuly Mobile.'));
  if (!review) {
    panel.appendChild(inlineAlert('Details unavailable', 'Message details could not be loaded.', 'warning'));
    return panel;
  }

  const preview = el('pre', 'message-preview message-primary');
  preview.textContent = review.message || '(empty message)';
  panel.appendChild(preview);
  const meta = el('div', 'review-meta');
  meta.append(
    detail('UTF-8 size', `${review.byteLength} bytes`),
    detail('SEP-53 hash', shortAddress(review.hash, 8), true)
  );
  panel.appendChild(meta);
  review.warnings.forEach((warning) => panel.appendChild(inlineAlert('Review carefully', warning, 'warning')));
  return panel;
}

export function authEntryReviewPanel(review?: AuthEntryReview) {
  const panel = el('section', 'review-panel');
  panel.appendChild(sectionHeading('Soroban authorization', 'Review the complete invocation on mobile.'));
  if (!review) {
    panel.appendChild(inlineAlert('Details unavailable', 'Authorization details could not be loaded.', 'warning'));
    return panel;
  }

  const invocation = el('article', 'invocation-card');
  const symbol = el('span', 'invocation-icon');
  symbol.appendChild(icon('blocks', 21));
  const copy = el('div');
  copy.append(
    el('small', '', review.invocation.type),
    el('b', '', review.invocation.functionName || 'Soroban invocation'),
    el('p', 'mono', review.invocation.contractAddress
      ? shortAddress(review.invocation.contractAddress, 8)
      : 'No contract address')
  );
  invocation.append(symbol, copy);
  panel.appendChild(invocation);

  const meta = el('div', 'review-meta');
  meta.append(
    detail('Expires at ledger', String(review.expirationLedger)),
    detail('Invocations', String(review.invocation.invocationsCount)),
    detail('Bound account', review.boundAddress ? shortAddress(review.boundAddress, 6) : 'Legacy / unbound', true),
    detail('Fingerprint', shortAddress(review.fingerprint, 8), true)
  );
  panel.appendChild(meta);
  review.warnings.forEach((warning) => panel.appendChild(inlineAlert('Review carefully', warning, 'warning')));
  return panel;
}

export function confirmDialog(
  title: string,
  description: string,
  confirmLabel: string,
  tone: 'primary' | 'danger' = 'primary'
) {
  return new Promise<boolean>((resolve) => {
    const dialog = el('dialog', 'modal-dialog') as HTMLDialogElement;
    const card = el('div', 'modal-card');
    const symbol = el('span', `modal-symbol modal-${tone}`);
    symbol.appendChild(icon(tone === 'danger' ? 'warning' : 'shield-check', 24));
    const copy = el('div', 'modal-copy');
    copy.append(el('h2', '', title), el('p', '', description));
    const actions = el('div', 'modal-actions');
    const cancel = button('Cancel', 'btn ghost');
    const confirm = button(confirmLabel, `btn ${tone === 'danger' ? 'danger' : 'primary'}`);
    actions.append(cancel, confirm);
    card.append(symbol, copy, actions);
    dialog.appendChild(card);
    document.body.appendChild(dialog);

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(false);
    });
    dialog.showModal();
    cancel.focus();
  });
}
