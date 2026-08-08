import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const requiredFiles = [
  'LICENSE',
  'TRADEMARKS.md',
  'THIRD_PARTY_NOTICES.md',
  'PRIVACY.md',
  'SECURITY.md',
  'SUPPORT.md',
  '.gitignore',
  '.github/CODEOWNERS',
  '.github/workflows/ci.yml'
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
const publicationTextExtensions = new Set([
  '', '.css', '.html', '.js', '.json', '.jsx', '.less', '.md', '.mjs',
  '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml'
]);
const ignoredLanguageGuardRoots = new Set([
  '.git', 'dist', 'keys', 'node_modules', 'playground-dist', 'release'
]);

function publicationTextFiles(directory, relativeDirectory = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!relativeDirectory && ignoredLanguageGuardRoots.has(entry.name)) return [];
      return publicationTextFiles(path.join(directory, entry.name), relativePath);
    }
    if (!entry.isFile()) return [];
    return publicationTextExtensions.has(path.extname(entry.name).toLowerCase())
      ? [relativePath]
      : [];
  });
}

if (missing.length) {
  console.error('Missing open-source publication files:', missing.join(', '));
  process.exit(1);
}

const cyrillicFiles = publicationTextFiles(root).filter((file) => (
  /[\u0400-\u04ff]/u.test(fs.readFileSync(path.join(root, file), 'utf8'))
));
if (cyrillicFiles.length) {
  console.error(
    'Publication text must remain English-only; Cyrillic text found in:',
    cyrillicFiles.join(', ')
  );
  process.exit(1);
}

const publicDocumentationFiles = publicationTextFiles(root).filter((file) => (
  path.extname(file).toLowerCase() === '.md' && file !== 'AGENTS.md'
));
const nonExtensionDocumentation = publicDocumentationFiles.flatMap((file) => {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const forbiddenReferences = [
    /\bFramework7\b/i,
    /\bCordova\b/i,
    /\bCodeIgniter\b/i,
    /\bbackend\b/i,
    /\bserver-side\b/i,
    /\bFirebase\b/i,
    /\bFCM\b/i,
    /\bAPNs\b/i,
    /\bTestFlight\b/i,
    /\.ipa\b/i,
    /\.aab\b/i,
    /scopuly-app-react/i,
    /scopuly-server/i
  ].filter((pattern) => pattern.test(content));
  return forbiddenReferences.length ? [file] : [];
});
if (nonExtensionDocumentation.length) {
  console.error(
    'Public documentation must describe the browser extension only:',
    nonExtensionDocumentation.join(', ')
  );
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.license !== 'MIT') {
  console.error('package.json must declare the same MIT license as the repository.');
  process.exit(1);
}
if (packageJson.repository?.url
  !== 'git+https://github.com/Scopuly/scopuly-browser-extension.git') {
  console.error('package.json must identify the official public GitHub repository.');
  process.exit(1);
}

const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const requiredIgnoreRules = [
  'keys/',
  '*.pem',
  '*.crx',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.p8',
  '*.pkcs12',
  '*.jks',
  '*.keystore',
  '*.kdbx',
  '*.mobileprovision',
  '.env',
  '.npmrc',
  '.web-ext-config.js',
  'dist/',
  'release/',
  'docs/options-wide-review.png',
  'docs/visual-review.png',
  'docs/store-assets/scopuly-onboarding-raw.png',
  'src/background/vault.ts',
  'src/shared/crypto.ts',
];
const missingIgnoreRules = requiredIgnoreRules.filter((rule) => !ignore.split(/\r?\n/).includes(rule));
if (missingIgnoreRules.length) {
  console.error('Missing sensitive publication ignore rules:', missingIgnoreRules.join(', '));
  process.exit(1);
}

if (fs.existsSync(path.join(root, '.git'))) {
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8'
  });
  if (tracked.status !== 0) {
    console.error(tracked.stderr || 'Could not inspect tracked Git files.');
    process.exit(1);
  }

  if (!tracked.stdout) {
    console.warn(
      'Git is initialized but has no tracked files yet; tracked-secret checks activate after the first git add.'
    );
  }

  const forbidden = tracked.stdout.split('\0').filter(Boolean).filter((file) => (
    /(^|\/)keys\//i.test(file)
    || /\.(?:pem|crx|key|p8|p12|pfx|pkcs12|jks|keystore|kdbx|mobileprovision)$/i.test(file)
    || /(^|\/)\.env(?:\.|$)/i.test(file) && !file.endsWith('.env.example')
    || /(^|\/)\.(?:npmrc|pypirc)$/i.test(file)
    || /(^|\/)\.web-ext-config\.js$/i.test(file)
    || /(^|\/)(?:id_rsa|id_ed25519)$/i.test(file)
    || /(^|\/)(?:GoogleService-Info\.plist|google-services\.json)$/i.test(file)
    || /(^|\/)(?:credentials[^/]*|[^/]*service-account[^/]*|[^/]*firebase-admin[^/]*|[^/]+\.secrets)\.json$/i.test(file)
    || file === 'src/background/vault.ts'
    || file === 'src/shared/crypto.ts'
  ));
  if (forbidden.length) {
    console.error('Sensitive files are tracked by Git:', forbidden.join(', '));
    process.exit(1);
  }
}

console.log('Open-source publication guard looks good.');
