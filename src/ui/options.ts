import './styles.css';
import type { DappPolicy, ExtensionSettings, WalletState } from '../shared/types';
import { NETWORKS, type NetworkId, type ThemeMode } from '../shared/types';
import { formatOrigin } from '../shared/format';
import { api } from './api';
import { SCOPULY_PROVIDER_VERSION } from '../shared/provider-contract';
import {
  actionButton,
  appHeader,
  confirmDialog,
  emptyState,
  iconButton,
  inlineAlert,
  sectionHeading,
  statusChip
} from './components';
import { button, el, input, mount, safeAction, setTheme, showToast } from './dom';
import { icon } from './icons';
import { siteAvatar } from './site-avatar';

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Origin is required.');
  const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Only web origins are supported.');
  return parsed.origin;
}

function settingToggle(
  title: string,
  description: string,
  checked: boolean,
  onChange: (checked: boolean, control: HTMLInputElement) => Promise<void>
) {
  const row = el('label', 'setting-row toggle-setting');
  const copy = el('span', 'setting-copy');
  copy.append(el('b', '', title), el('small', '', description));
  const control = el('input') as HTMLInputElement;
  control.type = 'checkbox';
  control.checked = checked;
  const visual = el('span', 'switch-control');
  visual.appendChild(el('span'));
  row.append(copy, control, visual);
  control.addEventListener('change', () => {
    void onChange(control.checked, control);
  });
  return row;
}

function policyRow(policy: DappPolicy, onRemove: (origin: string) => void) {
  const row = el('article', 'policy-row');
  const label = policy.name || formatOrigin(policy.origin);
  const copy = el('div', 'policy-copy');
  copy.append(
    siteAvatar(policy.origin, label),
    el('span', '', '')
  );
  const text = copy.lastElementChild!;
  text.append(el('b', '', label), el('small', '', policy.origin));
  row.append(
    copy,
    statusChip(policy.status === 'trusted' ? 'Trusted' : 'Blocked', policy.status === 'trusted' ? 'success' : 'danger'),
    iconButton('Remove policy', 'trash', () => onRemove(policy.origin), 'subtle danger-text')
  );
  return row;
}

async function render() {
  const [state, settings, policies]: [WalletState, ExtensionSettings, DappPolicy[]] = await Promise.all([
    api.getState(),
    api.getSettings(),
    api.getPolicies()
  ]);
  setTheme(state.theme);

  const app = el('main', 'options-app');
  app.appendChild(appHeader({ state }));

  const hero = el('section', 'options-hero');
  const symbol = el('span', 'options-hero-icon');
  symbol.appendChild(icon('shield', 28));
  const heroCopy = el('div');
  heroCopy.append(
    statusChip('SCOPULY SIGNER', 'neutral'),
    el('h1', '', 'Security & privacy'),
    el('p', '', 'Control which websites can reach your paired Scopuly signer. Keys and final approval always stay in Scopuly on your signing device.')
  );
  hero.append(symbol, heroCopy);
  app.appendChild(hero);

  const layout = el('div', 'settings-layout');
  const main = el('div', 'settings-main');
  const aside = el('aside', 'settings-aside');

  const security = el('section', 'panel settings-section');
  security.appendChild(sectionHeading(
    'Request protection',
    'Changes are saved immediately and apply before a request reaches Scopuly.'
  ));

  const saveSetting = async (
    partial: Partial<ExtensionSettings>,
    control: HTMLInputElement,
    previous: boolean
  ) => {
    control.disabled = true;
    try {
      await api.saveSettings(partial);
      showToast('Security setting saved', 'success');
    } catch (error) {
      control.checked = previous;
      showToast(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      control.disabled = false;
    }
  };

  security.append(
    settingToggle(
      'Block non-HTTPS dApps',
      'Local development origins remain available.',
      settings.blockUnsecureOrigins,
      (checked, control) => saveSetting({ blockUnsecureOrigins: checked }, control, !checked)
    ),
    settingToggle(
      'Show advanced XDR details',
      'Adds the full encoded transaction beneath the human-readable review.',
      settings.showAdvancedReview,
      (checked, control) => saveSetting({ showAdvancedReview: checked }, control, !checked)
    )
  );
  main.appendChild(security);

  const policy = el('section', 'panel settings-section');
  policy.appendChild(sectionHeading(
    'dApp policies',
    'Block unsafe origins or label websites you recognize.'
  ));
  const policyForm = el('div', 'policy-form');
  const originInput = input('text', 'app.example.com');
  originInput.setAttribute('aria-label', 'Website origin');
  const nameInput = input('text', 'Label (optional)');
  nameInput.setAttribute('aria-label', 'Policy label');
  const trust = actionButton('Trust', 'shield-check', 'btn outline');
  trust.addEventListener('click', () => safeAction(trust, async () => {
    await api.setDappPolicy(normalizeOrigin(originInput.value), 'trusted', nameInput.value.trim());
    showToast('Trusted dApp policy added', 'success');
    await render();
  }));
  const block = actionButton('Block', 'warning', 'btn ghost danger-text');
  block.addEventListener('click', () => safeAction(block, async () => {
    await api.setDappPolicy(normalizeOrigin(originInput.value), 'blocked', nameInput.value.trim());
    showToast('Blocked dApp policy added', 'success');
    await render();
  }));
  policyForm.append(originInput, nameInput, trust, block);
  policy.appendChild(policyForm);

  const policyList = el('div', 'policy-list');
  if (!policies.length) {
    policyList.appendChild(emptyState(
      'No custom policies',
      'Scopuly still applies HTTPS and origin checks to every request.',
      'shield-check'
    ));
  } else {
    policies.forEach((item) => policyList.appendChild(policyRow(item, async (origin) => {
      await api.removeDappPolicy(origin);
      showToast('dApp policy removed', 'success');
      await render();
    })));
  }
  policy.appendChild(policyList);
  main.appendChild(policy);

  const appearance = el('section', 'panel settings-section compact-settings');
  appearance.appendChild(sectionHeading('Appearance', 'Dark-first with complete light-theme parity.'));
  const themeChoices = el('div', 'choice-grid');
  const themes: Array<[ThemeMode, 'moon' | 'sun', string]> = [
    ['dark', 'moon', 'Dark'],
    ['light', 'sun', 'Light']
  ];
  themes.forEach(([theme, iconName, label]) => {
    const choice = actionButton(label, iconName, `choice-button${state.theme === theme ? ' active' : ''}`);
    choice.addEventListener('click', () => safeAction(choice, async () => {
      await api.setTheme(theme);
      showToast(`${label} theme enabled`, 'success');
      await render();
    }));
    themeChoices.appendChild(choice);
  });
  appearance.appendChild(themeChoices);
  aside.appendChild(appearance);

  const network = el('section', 'panel settings-section compact-settings');
  network.appendChild(sectionHeading(
    'Default network',
    'Used only when a new request does not specify a network.'
  ));
  const networkChoices = el('div', 'choice-grid');
  (Object.keys(NETWORKS) as NetworkId[]).forEach((networkId) => {
    const choice = button('', `choice-button${state.networkId === networkId ? ' active' : ''}`);
    choice.append(
      el('span', 'network-signal'),
      el('span', '', NETWORKS[networkId].label),
      state.networkId === networkId ? icon('check', 17) : icon('chevron-right', 17)
    );
    choice.addEventListener('click', () => safeAction(choice, async () => {
      await api.setNetwork(networkId);
      showToast(`Default network: ${NETWORKS[networkId].label}`, 'success');
      await render();
    }));
    networkChoices.appendChild(choice);
  });
  network.appendChild(networkChoices);
  aside.appendChild(network);

  const disconnect = el('section', 'panel settings-section compact-settings danger-zone');
  disconnect.appendChild(sectionHeading(
    'Disconnect Scopuly',
    'Revoke every paired Scopuly session and connected dApp. Security settings remain unchanged.'
  ));
  const disconnectAll = actionButton('Disconnect all sessions and dApps', 'trash', 'btn danger full-width');
  disconnectAll.addEventListener('click', async () => {
    const approved = await confirmDialog(
      'Disconnect everything?',
      'All Scopuly accounts and connected dApps will be removed from this browser. Pairing will be required again.',
      'Disconnect all',
      'danger'
    );
    if (!approved) return;
    await safeAction(disconnectAll, async () => {
      await api.disconnectAll();
      showToast('All Scopuly connections were removed', 'success');
      await render();
    });
  });
  disconnect.appendChild(disconnectAll);
  aside.appendChild(disconnect);

  const about = el('section', 'panel settings-section compact-settings');
  about.appendChild(sectionHeading('Advanced & about'));
  const diagnostics = el('details', 'diagnostics-details');
  diagnostics.appendChild(el('summary', '', 'Diagnostics'));
  const diagnosticList = el('div', 'diagnostic-list');
  const bridgeStatus = state.transportConfigured
    ? (state.initialized ? state.bridgeHealth.status : 'Waiting for pairing')
    : 'Build configuration required';
  [
    ['Mobile bridge', bridgeStatus],
    ['Provider', `window.scopuly v${SCOPULY_PROVIDER_VERSION}`],
    ['Local signing', 'Disabled'],
    ['Private key access', 'None']
  ].forEach(([label, value]) => {
    const row = el('div', 'diagnostic-row');
    row.append(el('span', '', label), el('b', '', value));
    diagnosticList.appendChild(row);
  });
  diagnostics.appendChild(diagnosticList);
  const version = el('div', 'about-version');
  version.append(
    el('span', '', 'Scopuly Extension'),
    el('b', '', `Version ${chrome.runtime.getManifest().version}`)
  );
  const privacy = inlineAlert(
    'Privacy-first by design',
    'No ads, analytics, browsing-history collection or remote executable code.',
    'neutral'
  );
  about.append(diagnostics, version, privacy);
  aside.appendChild(about);

  layout.append(main, aside);
  app.appendChild(layout);
  mount('options-root', app);
}

render().catch((error) => {
  const app = el('main', 'options-app');
  app.append(
    appHeader(),
    inlineAlert('Settings could not be loaded', error instanceof Error ? error.message : String(error), 'danger')
  );
  mount('options-root', app);
});
