import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import { chromium } from 'playwright-core';

const root = process.cwd();
const storeFontFaceCss = `
  @font-face {
    font-family: "Baloo 2";
    font-style: normal;
    font-weight: 400 700;
    src: url("data:font/woff2;base64,${fs.readFileSync(
      path.join(root, 'src', 'ui', 'fonts', 'Baloo2-SemiBold.woff2')
    ).toString('base64')}") format("woff2");
  }
`;
const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8')
);
const archiveArgument = process.argv.find((argument) => (
  argument === '--archive' || argument.startsWith('--archive=')
));
const archivePath = archiveArgument
  ? archiveArgument === '--archive'
    ? path.join(
        root,
        'release',
        `scopuly-mobile-signer-chromium-v${sourceManifest.version}.zip`
      )
    : path.resolve(root, archiveArgument.slice('--archive='.length))
  : undefined;
const extractedExtensionPath = archivePath
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'scopuly-extension-package-'))
  : undefined;
const extensionPath = extractedExtensionPath || path.join(root, 'dist');
const screenshotDir = path.join(root, 'docs', 'store-assets');
const executableCandidates = [
  process.env.SCOPULY_CHROME_PATH,
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));

if (!executablePath) {
  if (extractedExtensionPath?.startsWith(os.tmpdir())) {
    fs.rmSync(extractedExtensionPath, { recursive: true, force: true });
  }
  throw new Error('Test Chromium was not found. Run: npx playwright-core install chromium');
}
if (archivePath) {
  if (!fs.existsSync(archivePath)) {
    fs.rmSync(extractedExtensionPath, { recursive: true, force: true });
    throw new Error(`Release archive was not found: ${archivePath}`);
  }
  const extraction = spawnSync(
    'unzip',
    ['-q', archivePath, '-d', extractedExtensionPath],
    { encoding: 'utf8' }
  );
  if (extraction.status !== 0) {
    fs.rmSync(extractedExtensionPath, { recursive: true, force: true });
    throw new Error(
      extraction.stderr || `Could not extract release archive: ${archivePath}`
    );
  }
}
if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  if (extractedExtensionPath?.startsWith(os.tmpdir())) {
    fs.rmSync(extractedExtensionPath, { recursive: true, force: true });
  }
  throw new Error('Build the Chromium target before running the smoke test.');
}

const dappServer = http.createServer((_request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'",
    'Cache-Control': 'no-store'
  });
  response.end('<!doctype html><meta charset="utf-8"><title>Scopuly provider smoke</title>');
});
await new Promise((resolve, reject) => {
  dappServer.once('error', reject);
  dappServer.listen(0, '127.0.0.1', resolve);
});
const dappAddress = dappServer.address();
const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'scopuly-extension-smoke-'));
const pageErrors = [];
let context;

try {
  context = await chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  const keyStorageResult = await serviceWorker.evaluate(async () => {
    const databaseName = `scopuly-extension-key-smoke-${crypto.randomUUID()}`;
    const pair = await crypto.subtle.generateKey(
      {name: 'ECDH', namedCurve: 'P-256'},
      false,
      ['deriveBits']
    );
    const open = () => new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('keys', {keyPath: 'id'});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const requestResult = (request) => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const database = await open();
    try {
      const write = database.transaction('keys', 'readwrite');
      await requestResult(write.objectStore('keys').put({
        id: 'smoke',
        privateKey: pair.privateKey
      }));
      const read = database.transaction('keys', 'readonly');
      const restored = await requestResult(read.objectStore('keys').get('smoke'));
      let exportRejected = false;
      try {
        await crypto.subtle.exportKey('jwk', restored.privateKey);
      } catch (_error) {
        exportRejected = true;
      }
      return {
        type: restored.privateKey.type,
        extractable: restored.privateKey.extractable,
        exportRejected
      };
    } finally {
      database.close();
      indexedDB.deleteDatabase(databaseName);
    }
  });
  if (keyStorageResult.type !== 'private'
    || keyStorageResult.extractable !== false
    || keyStorageResult.exportRejected !== true) {
    throw new Error(
      `Unexpected extension key storage result: ${JSON.stringify(keyStorageResult)}`
    );
  }

  const dapp = await context.newPage();
  const dappConsoleErrors = [];
  dapp.on('pageerror', (error) => pageErrors.push(error.message));
  dapp.on('console', (message) => {
    if (message.type() === 'error') dappConsoleErrors.push(message.text());
  });
  await dapp.goto(`http://127.0.0.1:${dappAddress.port}/`);
  await dapp.waitForFunction(() => Boolean(window.scopuly?.isScopuly), null, {
    timeout: 10_000
  });
  const providerResult = await dapp.evaluate(async () => {
    const provider = window.scopuly;
    const descriptor = Object.getOwnPropertyDescriptor(window, 'scopuly');
    const [connection, network] = await Promise.all([
      provider.isConnected(),
      provider.getNetwork()
    ]);
    let unsupportedError = null;
    try {
      await provider.request({ method: 'unsupportedSmokeMethod' });
    } catch (error) {
      unsupportedError = error;
    }
    return {
      version: provider.version,
      platform: provider.platform,
      frozen: Object.isFrozen(provider),
      configurable: descriptor?.configurable,
      writable: descriptor?.writable,
      discovery: window.stellar?.scopuly,
      connection,
      network,
      unsupportedError
    };
  });
  if (providerResult.version !== '0.3.0'
    || providerResult.platform !== 'extension'
    || !providerResult.frozen
    || providerResult.configurable !== false
    || providerResult.writable !== false
    || providerResult.discovery?.platform !== 'extension'
    || providerResult.connection?.isConnected !== false
    || !['PUBLIC', 'TESTNET'].includes(providerResult.network?.network)
    || providerResult.unsupportedError?.code !== -3) {
    throw new Error(`Unexpected provider smoke result: ${JSON.stringify(providerResult)}`);
  }
  const relevantConsoleErrors = dappConsoleErrors.filter((message) => (
    /scopuly|chrome-extension|content security policy/i.test(message)
  ));
  if (relevantConsoleErrors.length) {
    throw new Error(`Provider console errors: ${relevantConsoleErrors.join(' | ')}`);
  }

  const popup = await context.newPage();
  popup.on('pageerror', (error) => pageErrors.push(error.message));
  await popup.setViewportSize({ width: 390, height: 760 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('h1').waitFor();

  const headline = await popup.locator('h1').textContent();
  if (headline !== 'Sign on your phone. Explore on desktop.') {
    throw new Error(`Unexpected onboarding headline: ${headline}`);
  }

  const layout = await popup.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    hasDisabledConnect: Boolean(document.querySelector('.btn.primary')?.disabled)
  }));
  if (layout.documentWidth > layout.viewportWidth) {
    throw new Error(`Popup overflows horizontally: ${layout.documentWidth}px > ${layout.viewportWidth}px.`);
  }
  if (layout.hasDisabledConnect) {
    throw new Error('The release build does not contain a configured mobile bridge URL.');
  }

  await popup.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotionDuration = await popup.locator('.wallet-app').evaluate((element) => (
    Number.parseFloat(getComputedStyle(element).animationDuration) || 0
  ));
  if (reducedMotionDuration > 0.001) {
    throw new Error(`Reduced-motion animation remains enabled: ${reducedMotionDuration}s.`);
  }
  await popup.emulateMedia({ reducedMotion: 'no-preference' });
  await popup.setViewportSize({ width: 320, height: 760 });
  const popupNarrowLayout = await popup.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  if (popupNarrowLayout.documentWidth > popupNarrowLayout.viewportWidth) {
    throw new Error(
      `Popup 320px fallback overflows: ${popupNarrowLayout.documentWidth}px > ${popupNarrowLayout.viewportWidth}px.`
    );
  }
  await popup.setViewportSize({ width: 390, height: 760 });

  fs.mkdirSync(screenshotDir, { recursive: true });
  const popupImage = await popup.screenshot({
    path: path.join(screenshotDir, 'scopuly-onboarding-raw.png'),
    fullPage: true
  });
  const wordmarkImage = fs.readFileSync(
    path.join(root, 'public', 'brand', 'scopuly-wordmark-light.png')
  );
  const coinImage = fs.readFileSync(
    path.join(root, 'public', 'brand', 'scopuly-coin-192.png')
  );

  const options = await context.newPage();
  options.on('pageerror', (error) => pageErrors.push(error.message));
  await options.setViewportSize({ width: 1120, height: 820 });
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator('h1').waitFor();
  const optionsLayout = await options.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  if (optionsLayout.documentWidth > optionsLayout.viewportWidth) {
    throw new Error(
      `Options page overflows horizontally: ${optionsLayout.documentWidth}px > ${optionsLayout.viewportWidth}px.`
    );
  }
  await options.getByRole('button', { name: 'Light', exact: true }).click();
  await options.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await options.setViewportSize({ width: 320, height: 760 });
  const optionsNarrowLayout = await options.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  if (optionsNarrowLayout.documentWidth > optionsNarrowLayout.viewportWidth) {
    throw new Error(
      `Options 320px light-theme fallback overflows: ${optionsNarrowLayout.documentWidth}px > ${optionsNarrowLayout.viewportWidth}px.`
    );
  }
  await options.getByRole('button', { name: 'Dark', exact: true }).click();
  await options.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await options.setViewportSize({ width: 1120, height: 820 });
  await options.screenshot({
    path: path.join(root, 'docs', 'options-wide-review.png'),
    fullPage: true
  });

  const storeShot = await context.newPage();
  await storeShot.setViewportSize({ width: 1280, height: 800 });
  await storeShot.setContent(`
    <!doctype html>
    <html lang="en">
      <style>
        ${storeFontFaceCss}
        * { box-sizing: border-box; }
        body {
          margin: 0;
          width: 1280px;
          height: 800px;
          overflow: hidden;
          color: #f8f8fa;
          font-family: "Baloo 2", ui-rounded, system-ui, sans-serif;
          background:
            radial-gradient(circle at 78% 42%, rgba(77, 124, 249, .22), transparent 28%),
            radial-gradient(circle at 18% 90%, rgba(76, 225, 182, .12), transparent 34%),
            #050505;
        }
        main {
          height: 100%;
          display: grid;
          grid-template-columns: 1fr 470px;
          align-items: center;
          gap: 80px;
          padding: 70px 92px;
        }
        .eyebrow {
          color: #4d7cf9;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: .16em;
        }
        h1 { margin: 18px 0; max-width: 590px; font-size: 58px; line-height: 1.02; }
        p { max-width: 560px; color: #9a9aa3; font-size: 23px; line-height: 1.5; }
        ul { display: grid; gap: 12px; padding: 0; list-style: none; font-size: 18px; }
        li::before { content: "✓"; color: #4ce1b6; margin-right: 12px; font-weight: 900; }
        .frame {
          height: 700px;
          display: grid;
          place-items: start center;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, .14);
          border-radius: 28px;
          background: #050505;
          box-shadow: 0 35px 90px rgba(0, 0, 0, .46);
        }
        .frame img { display: block; width: 390px; height: auto; }
      </style>
      <body>
        <main>
          <section>
            <div class="eyebrow">SCOPULY MOBILE SIGNER</div>
            <h1>Your phone stays the final signer.</h1>
            <p>Connect Stellar dApps on desktop while every transaction is reviewed and approved in Scopuly Mobile.</p>
            <ul>
              <li>No secret keys in the extension</li>
              <li>Explicit dApp account access</li>
              <li>Mainnet and Testnet support</li>
            </ul>
          </section>
          <div class="frame">
            <img alt="Scopuly extension onboarding" src="data:image/png;base64,${popupImage.toString('base64')}">
          </div>
        </main>
      </body>
    </html>
  `);
  await storeShot.screenshot({
    path: path.join(screenshotDir, 'scopuly-store-onboarding-1280x800.png')
  });

  await storeShot.setViewportSize({ width: 1400, height: 560 });
  await storeShot.setContent(`
    <!doctype html>
    <html lang="en">
      <style>
        ${storeFontFaceCss}
        * { box-sizing: border-box; }
        body {
          margin: 0;
          width: 1400px;
          height: 560px;
          overflow: hidden;
          color: #f8f8fa;
          font-family: "Baloo 2", ui-rounded, system-ui, sans-serif;
          background:
            radial-gradient(circle at 78% 35%, rgba(121, 87, 255, .28), transparent 29%),
            radial-gradient(circle at 12% 115%, rgba(76, 225, 182, .14), transparent 36%),
            #07070b;
        }
        main {
          height: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 430px;
          align-items: center;
          gap: 72px;
          padding: 54px 96px;
        }
        .eyebrow { color: #718ffb; font-size: 15px; font-weight: 800; letter-spacing: .16em; }
        h1 { max-width: 680px; margin: 16px 0; font-size: 56px; line-height: 1.02; }
        p { max-width: 650px; margin: 0; color: #adafbd; font-size: 21px; line-height: 1.45; }
        .frame {
          height: 640px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, .14);
          border-radius: 28px;
          background: #07070b;
          box-shadow: 0 35px 90px rgba(0, 0, 0, .48);
          transform: rotate(2deg);
        }
        .frame img { display: block; width: 390px; margin: 20px auto 0; }
      </style>
      <body>
        <main>
          <section>
            <div class="eyebrow">SCOPULY MOBILE SIGNER</div>
            <h1>Explore on desktop. Sign on your phone.</h1>
            <p>A secure bridge for Stellar dApps. Your secret keys stay out of the browser.</p>
          </section>
          <div class="frame">
            <img alt="Scopuly extension onboarding" src="data:image/png;base64,${popupImage.toString('base64')}">
          </div>
        </main>
      </body>
    </html>
  `);
  await storeShot.screenshot({
    path: path.join(screenshotDir, 'scopuly-marquee-1400x560.png')
  });

  await storeShot.setViewportSize({ width: 440, height: 280 });
  await storeShot.setContent(`
    <!doctype html>
    <html lang="en">
      <style>
        ${storeFontFaceCss}
        * { box-sizing: border-box; }
        body {
          margin: 0;
          width: 440px;
          height: 280px;
          overflow: hidden;
          color: #f8f8fa;
          font-family: "Baloo 2", ui-rounded, system-ui, sans-serif;
          background:
            radial-gradient(circle at 100% 0, rgba(121, 87, 255, .38), transparent 44%),
            radial-gradient(circle at 0 120%, rgba(76, 225, 182, .16), transparent 42%),
            #07070b;
        }
        main { position: relative; height: 100%; padding: 28px 30px; }
        .wordmark { display: block; width: 132px; height: auto; }
        .eyebrow { margin-top: 35px; color: #718ffb; font-size: 10px; font-weight: 850; letter-spacing: .15em; }
        h1 { width: 330px; margin: 9px 0 0; font-size: 31px; line-height: 1.02; letter-spacing: -.035em; }
        p { margin: 11px 0 0; color: #adafbd; font-size: 13px; }
        .coin {
          position: absolute;
          width: 118px;
          height: 118px;
          right: -26px;
          bottom: -30px;
          filter: drop-shadow(0 20px 36px rgba(77, 124, 249, .32));
          transform: rotate(-8deg);
        }
      </style>
      <body>
        <main>
          <img class="wordmark" alt="Scopuly" src="data:image/png;base64,${wordmarkImage.toString('base64')}">
          <div class="eyebrow">STELLAR MOBILE SIGNER</div>
          <h1>Explore on desktop.<br>Sign on your phone.</h1>
          <p>Your phone is the final signer.</p>
          <img class="coin" alt="" src="data:image/png;base64,${coinImage.toString('base64')}">
        </main>
      </body>
    </html>
  `);
  await storeShot.screenshot({
    path: path.join(screenshotDir, 'scopuly-promo-440x280.png')
  });

  if (pageErrors.length) {
    throw new Error(`Extension page errors: ${pageErrors.join(' | ')}`);
  }
  console.log(`Chromium smoke test passed for extension ${extensionId}.`);
} finally {
  await context?.close();
  await new Promise((resolve) => dappServer.close(resolve));
  if (profilePath.startsWith(os.tmpdir())) {
    fs.rmSync(profilePath, { recursive: true, force: true });
  }
  if (extractedExtensionPath?.startsWith(os.tmpdir())) {
    fs.rmSync(extractedExtensionPath, { recursive: true, force: true });
  }
}
