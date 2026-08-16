import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'dist', 'manifest.json');
const sourceManifestPath = path.join(root, 'public', 'manifest.json');
const inspectDist = process.argv.includes('--dist');
const selectedManifestPath = inspectDist ? manifestPath : sourceManifestPath;
if (!fs.existsSync(selectedManifestPath)) {
  console.error(`Missing extension manifest: ${selectedManifestPath}`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(selectedManifestPath, 'utf8'));
const productionName = 'Scopuly – Stellar Signer';
const maximumDescriptionLength = 132;

if (manifest.name !== productionName || /\bv?\d+\.\d+(?:\.\d+)?\b/i.test(manifest.name)) {
  console.error(`Publication name must be exactly "${productionName}" without a version.`);
  process.exit(1);
}
if (
  typeof manifest.description !== 'string'
  || !/\bStellar\b/.test(manifest.description)
  || manifest.description.length > maximumDescriptionLength
) {
  console.error(
    `Publication description must identify Stellar and stay within ${maximumDescriptionLength} characters.`
  );
  process.exit(1);
}
const contentScripts = manifest.content_scripts || [];
const backgroundEntry = manifest.background?.service_worker || manifest.background?.scripts?.[0];
const required = inspectDist
  ? [
      manifest.action.default_popup,
      backgroundEntry,
      ...manifest.content_scripts.flatMap((script) => script.js),
      'confirm.html',
      'options.html',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'OFL.txt'
    ]
  : [
      'popup.html',
      'confirm.html',
      'options.html',
      'src/background/service-worker.ts',
      'src/content/content-script.ts',
      'src/content/injected-provider.ts'
    ];

const base = inspectDist ? path.join(root, 'dist') : root;
const missing = required.filter((file) => !fs.existsSync(path.join(base, file)));
if (missing.length) {
  console.error('Missing extension artifacts:', missing.join(', '));
  process.exit(1);
}

const contractSource = fs.readFileSync(
  path.join(root, 'src', 'shared', 'provider-contract.ts'),
  'utf8'
);
const providerSource = fs.readFileSync(
  path.join(root, 'src', 'content', 'injected-provider.ts'),
  'utf8'
);
const contractVersion = contractSource.match(/SCOPULY_PROVIDER_VERSION\s*=\s*['"]([^'"]+)/)?.[1];
const injectedVersion = providerSource.match(/SCOPULY_PROVIDER_VERSION\s*=\s*['"]([^'"]+)/)?.[1];
if (!contractVersion || contractVersion !== injectedVersion) {
  console.error('Injected provider and background provider contract versions differ.');
  process.exit(1);
}

const csp = manifest.content_security_policy?.extension_pages || '';
const scriptSource = csp.match(/script-src\s+([^;]+)/)?.[1] || '';
if (/https?:|unsafe-eval|unsafe-inline/.test(scriptSource)) {
  console.error('Unsafe extension CSP:', csp);
  process.exit(1);
}

const bannedPermissions = ['tabs', 'activeTab', 'scripting', 'webRequest'];
const excessivePermissions = (manifest.permissions || []).filter((permission) => bannedPermissions.includes(permission));
if (excessivePermissions.length) {
  console.error('Unexpected broad permissions:', excessivePermissions.join(', '));
  process.exit(1);
}

if ((manifest.permissions || []).join(',') !== 'storage') {
  console.error('Scopuly publication build must use storage as its only extension permission.');
  process.exit(1);
}

if ((manifest.host_permissions || []).join(',') !== 'https://api.scopuly.com/*') {
  console.error('Scopuly publication build must only grant api.scopuly.com host access.');
  process.exit(1);
}

if (!backgroundEntry) {
  console.error('The extension manifest must declare a background entry.');
  process.exit(1);
}

const isolatedBridge = contentScripts.find((entry) => (
  entry.world === 'ISOLATED'
  && entry.js?.length === 1
  && entry.js[0] === 'assets/content-script.js'
));
const mainProvider = contentScripts.find((entry) => (
  entry.world === 'MAIN'
  && entry.js?.length === 1
  && entry.js[0] === 'assets/injected-provider.js'
));
if (!isolatedBridge || !mainProvider) {
  console.error('Provider requires separate ISOLATED bridge and MAIN world content scripts.');
  process.exit(1);
}
if ([isolatedBridge, mainProvider].some((entry) => (
  entry.run_at !== 'document_start'
  || entry.all_frames !== false
  || entry.matches?.join(',') !== '<all_urls>'
))) {
  console.error('Provider content scripts must run only in the top frame at document_start.');
  process.exit(1);
}
if ((manifest.web_accessible_resources || []).length) {
  console.error('The provider must not expose extension JavaScript as a web-accessible resource.');
  process.exit(1);
}

if (inspectDist) {
  const files = fs.readdirSync(path.join(root, 'dist'), { recursive: true })
    .map((file) => String(file));
  const forbidden = files.filter((file) => /\.(?:map|pem|crx)$/i.test(file));
  if (forbidden.length) {
    console.error('Forbidden publication artifacts:', forbidden.join(', '));
    process.exit(1);
  }
  const providerBundle = fs.readFileSync(
    path.join(root, 'dist', 'assets', 'injected-provider.js'),
    'utf8'
  );
  if (/(?:^|\n)\s*import\s/.test(providerBundle)) {
    console.error('The MAIN world provider bundle must be a self-contained classic script.');
    process.exit(1);
  }
  if (!providerBundle.trimStart().startsWith('(()=>{')) {
    console.error('The MAIN world provider bundle must be isolated in an IIFE.');
    process.exit(1);
  }
  if (/\bchrome\./.test(providerBundle)) {
    console.error('The MAIN world provider must not access extension APIs.');
    process.exit(1);
  }
  const backgroundBundle = fs.readFileSync(
    path.join(root, 'dist', backgroundEntry),
    'utf8'
  );
  if (backgroundBundle.includes('privateKeyJwk')) {
    console.error('The release background must not serialize bridge private JWKs.');
    process.exit(1);
  }
}

console.log('Scopuly extension manifest looks good.');
