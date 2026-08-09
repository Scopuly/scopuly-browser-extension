import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8'));
const version = manifest.version;
const targets = ['chromium', 'edge', 'firefox', 'source'];
const archives = targets.map((target) => ({
  target,
  path: path.join(
    root,
    'release',
    `scopuly-mobile-signer-${target}-v${version}.zip`,
  ),
}));

const unzip = (archivePath, options, members = []) => {
  const result = spawnSync('unzip', [...options, archivePath, ...members], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Could not inspect ${archivePath}.`);
  }
  return result.stdout;
};

for (const archive of archives) {
  if (!fs.existsSync(archive.path)) {
    throw new Error(`Missing release archive: ${path.relative(root, archive.path)}`);
  }
  const names = unzip(archive.path, ['-Z1']).split(/\r?\n/).filter(Boolean);
  const forbiddenNames = names.filter((name) => (
    /\.(?:pem|crx|map|key|p8|p12|pfx|pkcs12|jks|keystore|kdbx|mobileprovision)$/i.test(name)
    || /(^|\/)\.env(?:\.|$)/i.test(name)
    || /(^|\/)\.(?:npmrc|pypirc)$/i.test(name)
    || /(^|\/)\.web-ext-config\.js$/i.test(name)
    || /(^|\/)(?:\.git|\.ssh|keys)\//i.test(name)
    || /(^|\/)(?:id_rsa|id_ed25519)$/i.test(name)
    || /(^|\/)(?:GoogleService-Info\.plist|google-services\.json)$/i.test(name)
    || /(^|\/)(?:credentials[^/]*|[^/]*service-account[^/]*|[^/]*firebase-admin[^/]*|[^/]+\.secrets)\.json$/i.test(name)
  ));
  if (forbiddenNames.length) {
    throw new Error(
      `${archive.target} archive contains forbidden files: ${forbiddenNames.join(', ')}`,
    );
  }

  if (archive.target === 'source') {
    const forbiddenSourcePaths = names.filter((name) => (
      /^(?:dist|landing|release|node_modules)\//.test(name)
      || name === 'AGENTS.md'
      || name === 'src/background/vault.ts'
      || name === 'src/shared/crypto.ts'
    ));
    if (forbiddenSourcePaths.length) {
      throw new Error(
        `Source archive contains excluded paths: ${forbiddenSourcePaths.join(', ')}`,
      );
    }
    const requiredSourcePaths = [
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'src/ui/fonts/OFL.txt',
      'PRIVACY.md',
      'SECURITY.md',
      'protocol/scopuly-bridge-v1.schema.json',
      'protocol/fixtures/bridge-v1.json',
      'src/background/bridge-key-store.ts',
      'scripts/reproduce-firefox.mjs',
      'scripts/smoke-extension.mjs',
      'scripts/smoke-firefox.mjs',
      'integrations/stellar-wallets-kit/scopuly-extension.module.mjs',
      'integrations/stellar-wallets-kit/scopuly-extension.module.d.ts',
    ];
    const missing = requiredSourcePaths.filter((name) => !names.includes(name));
    if (missing.length) {
      throw new Error(`Source archive is missing: ${missing.join(', ')}`);
    }
    continue;
  }

  const requiredExtensionPaths = [
    'manifest.json',
    'popup.html',
    'confirm.html',
    'options.html',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'OFL.txt',
    'assets/background.js',
    'assets/content-script.js',
    'assets/injected-provider.js',
  ];
  const missing = requiredExtensionPaths.filter((name) => !names.includes(name));
  if (missing.length) {
    throw new Error(`${archive.target} archive is missing: ${missing.join(', ')}`);
  }

  const packagedManifest = JSON.parse(unzip(archive.path, ['-p'], ['manifest.json']));
  if (packagedManifest.version !== version) {
    throw new Error(`${archive.target} archive has the wrong manifest version.`);
  }
  const isolatedBridge = packagedManifest.content_scripts?.find((entry) => (
    entry.world === 'ISOLATED'
    && entry.js?.join(',') === 'assets/content-script.js'
  ));
  const mainProvider = packagedManifest.content_scripts?.find((entry) => (
    entry.world === 'MAIN'
    && entry.js?.join(',') === 'assets/injected-provider.js'
  ));
  if (!isolatedBridge || !mainProvider) {
    throw new Error(
      `${archive.target} archive is missing the MAIN/ISOLATED provider boundary.`,
    );
  }
  if ((packagedManifest.web_accessible_resources || []).length) {
    throw new Error(`${archive.target} archive exposes web-accessible resources.`);
  }
  if (archive.target === 'firefox') {
    if (!Array.isArray(packagedManifest.background?.scripts)) {
      throw new Error('Firefox archive does not contain an event-page background.');
    }
    if (packagedManifest.browser_specific_settings?.gecko?.strict_min_version !== '140.0'
      || packagedManifest.browser_specific_settings?.gecko_android?.strict_min_version !== '142.0') {
      throw new Error('Firefox archive has the wrong minimum Firefox version.');
    }
  } else if (!packagedManifest.background?.service_worker) {
    throw new Error(`${archive.target} archive does not contain a service worker.`);
  } else if (packagedManifest.minimum_chrome_version !== '116') {
    throw new Error(`${archive.target} archive has the wrong minimum Chromium version.`);
  }

  const providerBundle = unzip(
    archive.path,
    ['-p'],
    ['assets/injected-provider.js'],
  );
  if (!providerBundle.trimStart().startsWith('(()=>{')
    || /(?:^|\n)\s*import\s/.test(providerBundle)
    || /\bchrome\./.test(providerBundle)) {
    throw new Error(
      `${archive.target} archive has an unsafe MAIN-world provider bundle.`,
    );
  }
  const javascript = unzip(archive.path, ['-p'], ['assets/*.js']);
  const forbiddenRuntimeText = [
    'sourceMappingURL=',
    'http://localhost',
    'http://127.0.0.1',
    'VITE_SCOPULY_BRIDGE_URL',
    'privateKeyJwk',
  ].filter((value) => javascript.includes(value));
  if (forbiddenRuntimeText.length) {
    throw new Error(
      `${archive.target} runtime contains development text: ${forbiddenRuntimeText.join(', ')}`,
    );
  }
}

console.log(`Scopuly v${version} release archives look good.`);
