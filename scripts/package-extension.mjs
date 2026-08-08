import fs from 'node:fs';
import path from 'node:path';
import { ZipArchive } from 'archiver';

const target = process.argv[2];
if (!['chromium', 'edge', 'firefox', 'source'].includes(target)) {
  console.error('Usage: node scripts/package-extension.mjs <chromium|edge|firefox|source>');
  process.exit(1);
}

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8'));
const releaseDir = path.join(root, 'release');
const archiveDate = new Date('2026-01-01T00:00:00.000Z');
const outputPath = path.join(
  releaseDir,
  target === 'source'
    ? `scopuly-mobile-signer-source-v${manifest.version}.zip`
    : `scopuly-mobile-signer-${target}-v${manifest.version}.zip`
);

fs.mkdirSync(releaseDir, { recursive: true });
const output = fs.createWriteStream(outputPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

const completed = new Promise((resolve, reject) => {
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('warning', (error) => {
    if (error.code === 'ENOENT') console.warn(error.message);
    else reject(error);
  });
  archive.on('error', reject);
});

archive.pipe(output);

if (target === 'source') {
  const excludedRoots = new Set([
    '.git',
    'dist',
    'playground-dist',
    'release',
    'node_modules',
    'keys'
  ]);
  const excludedFiles = new Set([
    'AGENTS.md',
    'docs/options-wide-review.png',
    'docs/store-assets/scopuly-onboarding-raw.png',
    'docs/visual-review.png',
    'src/background/vault.ts',
    'src/shared/crypto.ts'
  ]);
  const isSensitivePath = (name) => {
    const basename = path.posix.basename(name);
    return (
      /(?:^|\/)\.env(?:\.|$)/i.test(name) && !name.endsWith('.env.example')
    ) || /(?:^|\/)\.(?:npmrc|pypirc)$/i.test(name)
      || /(?:^|\/)\.web-ext-config\.js$/i.test(name)
      || /(?:^|\/)(?:\.git|\.ssh|keys)(?:\/|$)/i.test(name)
      || /\.(?:pem|crx|key|p8|p12|pfx|pkcs12|jks|keystore|kdbx|mobileprovision)$/i.test(name)
      || /^(?:id_rsa|id_ed25519)$/i.test(basename)
      || /(?:^|\/)(?:GoogleService-Info\.plist|google-services\.json)$/i.test(name)
      || /(?:^|\/)(?:credentials[^/]*|[^/]*service-account[^/]*|[^/]*firebase-admin[^/]*|[^/]+\.secrets)\.json$/i.test(name);
  };
  archive.directory(root, false, (entry) => {
    const name = entry.name.replaceAll(path.sep, '/').replace(/\/$/, '');
    const rootName = name.split('/')[0];
    if (excludedRoots.has(rootName)
      || excludedFiles.has(name)
      || /(?:^|\/)\.DS_Store$/i.test(name)
      || isSensitivePath(name)) {
      return false;
    }
    return {
      ...entry,
      date: archiveDate,
      mode: entry.stats?.isDirectory() ? 0o755 : 0o644
    };
  });
} else {
  const requiredLegalFiles = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'OFL.txt'];
  const missingLegalFiles = requiredLegalFiles.filter((name) => (
    !fs.existsSync(path.join(root, 'dist', name))
  ));
  if (missingLegalFiles.length) {
    throw new Error(`Built extension is missing legal notices: ${missingLegalFiles.join(', ')}`);
  }
  archive.directory(path.join(root, 'dist'), false, (entry) => ({
    ...entry,
    date: archiveDate,
    mode: entry.stats?.isDirectory() ? 0o755 : 0o644
  }));
}

await archive.finalize();
await completed;
console.log(`Created ${path.relative(root, outputPath)} (${archive.pointer()} bytes).`);
