import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { chromium } from 'playwright-core';

const root = process.cwd();
const dist = path.join(root, 'playground-dist');
const address = Keypair.random().publicKey();
const executableCandidates = [
  process.env.SCOPULY_CHROME_PATH,
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  throw new Error('Developer Playground build is missing. Run npm run playground:build.');
}
if (!executablePath) {
  throw new Error('Test Chromium was not found.');
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png'
};

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(dist, requested);
  if (!file.startsWith(`${dist}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.setHeader('Content-Type', mimeTypes[path.extname(file)] || 'application/octet-stream');
  response.writeHead(200).end(fs.readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const serverAddress = server.address();
if (!serverAddress || typeof serverAddress === 'string') throw new Error('Playground server did not start.');

let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript((publicKey) => {
    let connected = false;
    const listeners = [];
    const change = () => {
      const event = {
        address: connected ? publicKey : '',
        isConnected: connected,
        network: 'PUBLIC',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
        changed: ['address', 'isConnected']
      };
      listeners.forEach((listener) => listener(event));
    };
    window.scopuly = {
      __scopulyProviderVersion: '0.3.0',
      isScopuly: true,
      platform: 'extension',
      requestAccess: async () => {
        connected = true;
        change();
        return { address: publicKey };
      },
      getAddress: async () => ({ address: connected ? publicKey : '' }),
      getPublicKey: async () => connected ? publicKey : '',
      isConnected: async () => ({ isConnected: connected }),
      getNetwork: async () => ({
        network: 'PUBLIC',
        networkPassphrase: 'Public Global Stellar Network ; September 2015'
      }),
      signTransaction: async (xdr) => ({ signedXDR: xdr, signerAddress: publicKey }),
      signAndSubmitTransaction: async (xdr) => ({
        signedXDR: xdr,
        signerAddress: publicKey,
        status: 'success',
        hash: 'mock-mainnet-hash'
      }),
      signMessage: async () => ({ signedMessage: 'ab'.repeat(64), signerAddress: publicKey }),
      signAuthEntry: async () => ({ signedAuthEntry: 'mock', signerAddress: publicKey }),
      reportX402Receipt: async ({ receiptId }) => ({ receiptId, status: 'loaded' }),
      disconnect: async () => {
        connected = false;
        change();
      },
      onChange: (listener) => {
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        };
      }
    };
  }, address);
  await page.route('https://horizon.stellar.org/accounts/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account_id: address, sequence: '42' })
    });
  });
  await page.goto(`http://127.0.0.1:${serverAddress.port}/`, { waitUntil: 'networkidle' });

  await page.getByText('Detected', { exact: true }).waitFor();
  const stepFontSize = await page.locator('.step').first().evaluate((element) => (
    Number.parseFloat(getComputedStyle(element).fontSize)
  ));
  if (stepFontSize < 22) throw new Error(`Playground step numbers are too small: ${stepFontSize}px.`);
  await page.getByRole('button', { name: 'Testnet' }).click();
  await page.getByText('No-value Testnet transaction', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Public' }).click();
  await page.getByText('No-value Mainnet transaction', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Request access' }).click();
  await page.getByText('Connected', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sign message' }).click();
  await page.getByText(/signMessage/).waitFor();
  await page.getByRole('button', { name: 'Build safe XDR' }).click();
  await page.waitForFunction(() => document.querySelector('#transaction-xdr')?.value.length > 20);
  await page.getByRole('button', { name: 'Sign only' }).click();
  await page.getByText(/signTransaction/).waitFor();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByText('Disconnected', { exact: true }).waitFor();

  if (pageErrors.length) throw new Error(`Playground page errors: ${pageErrors.join('; ')}`);
  console.log('Developer Playground provider smoke passed.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
