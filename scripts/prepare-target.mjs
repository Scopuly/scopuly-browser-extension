import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!['chromium', 'firefox'].includes(target)) {
  console.error('Usage: node scripts/prepare-target.mjs <chromium|firefox>');
  process.exit(1);
}

const bridgeUrl = process.env.VITE_SCOPULY_BRIDGE_URL?.trim();
if (!bridgeUrl) {
  throw new Error('VITE_SCOPULY_BRIDGE_URL is required for a distributable build.');
}
const parsedBridgeUrl = new URL(bridgeUrl);
if (parsedBridgeUrl.protocol !== 'https:' || parsedBridgeUrl.hostname !== 'api.scopuly.com') {
  throw new Error('Publication builds must use an HTTPS bridge under api.scopuly.com.');
}

const manifestPath = path.join(process.cwd(), 'dist', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const chromiumManifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public', 'manifest.json'), 'utf8')
);

if (target === 'firefox') {
  const backgroundEntry = manifest.background?.service_worker;
  if (!backgroundEntry) {
    throw new Error('The Chromium manifest does not declare a background service worker.');
  }

  manifest.background = {
    scripts: [backgroundEntry],
    type: 'module'
  };
  delete manifest.minimum_chrome_version;
  manifest.browser_specific_settings = {
    gecko: {
      id: 'extension@scopuly.com',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: ['financialAndPaymentInfo', 'websiteActivity']
      }
    },
    gecko_android: {
      strict_min_version: '142.0'
    }
  };
} else {
  manifest.background = chromiumManifest.background;
  manifest.minimum_chrome_version = chromiumManifest.minimum_chrome_version;
  delete manifest.browser_specific_settings;
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${target} manifest.`);
