import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  hash
} from '@stellar/stellar-sdk';
import { chromium } from 'playwright-core';

const root = process.cwd();
const dappIcon = fs.readFileSync(
  path.join(root, 'public', 'brand', 'scopuly-coin-192.png')
);
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
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8')
);
const archiveArgument = process.argv.find((argument) => (
  argument === '--archive' || argument.startsWith('--archive=')
));
const archivePath = archiveArgument === '--archive' || !archiveArgument
  ? path.join(
      root,
      'release',
      `scopuly-stellar-signer-chromium-v${manifest.version}.zip`
    )
  : path.resolve(root, archiveArgument.slice('--archive='.length));
const captureReviewerAssets = process.argv.includes('--capture-assets');
const screenshotDir = path.join(root, 'docs', 'store-assets');
const reviewerUrl = process.env.SCOPULY_REVIEWER_URL?.trim();
if (captureReviewerAssets) {
  let reviewerProtocol = '';
  try {
    reviewerProtocol = reviewerUrl ? new URL(reviewerUrl).protocol : '';
  } catch (_error) {
    reviewerProtocol = '';
  }
  if (reviewerProtocol !== 'https:') {
    throw new Error(
      'Store captures require SCOPULY_REVIEWER_URL with a real HTTPS reviewer dApp.'
    );
  }
}
const extensionPath = fs.mkdtempSync(
  path.join(os.tmpdir(), 'scopuly-extension-pairing-package-')
);
const profilePath = fs.mkdtempSync(
  path.join(os.tmpdir(), 'scopuly-extension-pairing-profile-')
);
const executableCandidates = [
  process.env.SCOPULY_CHROME_PATH,
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));
const bridgePattern = 'https://api.scopuly.com/extension-bridge/**';
const protocolVersion = '1.0';
const pairingId = 'pairing-playwright-1';
const sessionId = 'session-playwright-1';
const extensionAccessToken = 'e'.repeat(43);
const pairingTicket = 't'.repeat(43);
const accountIds = ['account-playwright-1', 'account-playwright-2'];
const signers = [Keypair.random(), Keypair.random()];
const message = 'Sign in to the Scopuly Testnet reviewer';
const restartMessage = 'Confirm signer session after browser restart';
const rejectedMessage = 'Reject this Testnet signature request';
const cancelledMessage = 'Cancel this Testnet signature request';
const expiredMessage = 'Expire this Testnet signature request';
const testnetTransaction = new TransactionBuilder(
  new Account(signers[0].publicKey(), '1'),
  {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET
  }
)
  .addOperation(Operation.payment({
    destination: signers[1].publicKey(),
    asset: Asset.native(),
    amount: '1'
  }))
  .setTimeout(300)
  .build()
  .toXDR();
const encoder = new TextEncoder();

if (!executablePath) {
  throw new Error('Test Chromium was not found. Run: npx playwright-core install chromium');
}
if (!fs.existsSync(archivePath)) {
  throw new Error(`Release archive was not found: ${archivePath}`);
}

const extraction = spawnSync('unzip', ['-q', archivePath, '-d', extensionPath], {
  encoding: 'utf8'
});
if (extraction.status !== 0) {
  throw new Error(extraction.stderr || `Could not extract release archive: ${archivePath}`);
}
if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error('The Chromium release archive does not contain manifest.json.');
}

function bytes(value) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - value.length % 4) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function canonicalHeader(input) {
  return encoder.encode(JSON.stringify([
    'scopuly-bridge-envelope',
    input.protocolVersion,
    input.sessionId,
    input.requestId,
    input.direction,
    input.counter,
    input.expiresAt
  ]));
}

async function generateMobileChannel() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  return {
    privateKey: keyPair.privateKey,
    publicKey: base64UrlEncode(publicKey)
  };
}

async function deriveKey(privateKey, peerPublicKey, direction) {
  const peer = await crypto.subtle.importKey(
    'raw',
    bytes(base64UrlDecode(peerPublicKey)),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peer },
    privateKey,
    256
  );
  const material = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveKey']
  );
  const salt = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`scopuly-bridge-v1:${pairingId}`)
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode(`scopuly-bridge-v1:${direction}`)
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(payload, key, header) {
  const authenticatedHeader = { protocolVersion, ...header };
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: bytes(nonce),
      additionalData: bytes(canonicalHeader(authenticatedHeader)),
      tagLength: 128
    },
    key,
    bytes(encoder.encode(JSON.stringify(payload)))
  );
  return {
    ...authenticatedHeader,
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext)
  };
}

async function decrypt(envelope, key) {
  const nonce = base64UrlDecode(envelope.nonce);
  const ciphertext = base64UrlDecode(envelope.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes(nonce),
      additionalData: bytes(canonicalHeader(envelope)),
      tagLength: 128
    },
    key,
    bytes(ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function pairingProofPayload(
  extensionPublicKey,
  mobilePublicKey,
  accountId,
  accountPublicKey,
  expiresAt
) {
  return {
    pairingId,
    sessionId,
    extensionPublicKey,
    mobilePublicKey,
    accountId,
    accountPublicKey,
    expiresAt
  };
}

function pairingProof(payload, signer) {
  const canonical = JSON.stringify([
    protocolVersion,
    payload.pairingId,
    payload.sessionId,
    payload.extensionPublicKey,
    payload.mobilePublicKey,
    payload.accountId,
    payload.accountPublicKey,
    payload.expiresAt
  ]);
  const digest = hash(Buffer.concat([
    Buffer.from('Scopuly Bridge Pairing Proof v1\n', 'utf8'),
    Buffer.from(canonical, 'utf8')
  ]));
  return signer.sign(digest).toString('base64');
}

function messageHash(value) {
  return hash(Buffer.concat([
    Buffer.from('Stellar Signed Message:\n', 'utf8'),
    Buffer.from(value, 'utf8')
  ])).toString('hex');
}

function assert(condition, errorMessage) {
  if (!condition) throw new Error(errorMessage);
}

function jsonResponse(route, value, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify(value)
  });
}

async function waitForExtensionPage(context, pathname, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const page = context.pages().find((candidate) => {
      try {
        return new URL(candidate.url()).pathname === pathname;
      } catch (_error) {
        return false;
      }
    });
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Extension page did not open: ${pathname}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function captureStoreAsset(page, filename, eyebrow, title, description, options = {}) {
  if (!captureReviewerAssets) return;
  if (!context) throw new Error('Cannot capture a reviewer asset without Chromium.');

  fs.mkdirSync(screenshotDir, { recursive: true });
  if (new URL(page.url()).pathname === '/confirm.html') {
    await page.setViewportSize({ width: 430, height: 720 });
  }
  await page.evaluate(({ focusSelector, focusOffset }) => {
    const captureStyle = document.createElement('style');
    captureStyle.dataset.scopulyCapture = 'true';
    captureStyle.textContent = `
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .confirm-app { overflow: visible !important; }
    `;
    document.head.appendChild(captureStyle);
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo(0, 0);
    document.documentElement.scrollLeft = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollLeft = 0;
    document.body.scrollTop = 0;
    if (focusSelector) {
      const target = document.querySelector(focusSelector);
      if (target) {
        const targetTop = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, targetTop - focusOffset));
      }
    }
  }, {
    focusSelector: options.focusSelector || '',
    focusOffset: options.focusOffset || 0
  });
  await page.waitForTimeout(100);
  const layout = await page.evaluate(() => ({
    scrollX: window.scrollX,
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.querySelector('.confirm-app')?.scrollHeight || 0
    )
  }));
  assert(layout.scrollX === 0, `${filename} remained horizontally scrolled.`);
  assert(
    layout.documentWidth <= layout.viewportWidth,
    `${filename} overflows horizontally: ${layout.documentWidth}px > ${layout.viewportWidth}px.`
  );
  const productScreenshot = await page.screenshot({
    captureBeyondViewport: true
  });
  const frame = await context.newPage();
  await frame.setViewportSize({ width: 1280, height: 800 });
  await frame.setContent(`
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
            radial-gradient(circle at 80% 28%, rgba(77, 124, 249, .24), transparent 30%),
            radial-gradient(circle at 15% 90%, rgba(76, 225, 182, .13), transparent 34%),
            #050505;
        }
        main {
          height: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 520px;
          align-items: center;
          gap: 66px;
          padding: 54px 76px;
        }
        .eyebrow {
          color: #4d7cf9;
          font-size: 16px;
          font-weight: 850;
          letter-spacing: .16em;
        }
        h1 {
          max-width: 570px;
          margin: 18px 0;
          font-size: 54px;
          line-height: 1.04;
          letter-spacing: -.025em;
        }
        p {
          max-width: 540px;
          margin: 0;
          color: #a8a8b0;
          font-size: 22px;
          line-height: 1.5;
        }
        .proof {
          display: inline-flex;
          margin-top: 28px;
          border: 1px solid rgba(255, 255, 255, .14);
          border-radius: 999px;
          padding: 9px 13px;
          color: #4ce1b6;
          background: rgba(76, 225, 182, .08);
          font-size: 14px;
          font-weight: 750;
        }
        .frame {
          height: 692px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, .15);
          border-radius: 30px;
          background: #050505;
          box-shadow: 0 35px 90px rgba(0, 0, 0, .5);
        }
        .frame img {
          display: block;
          width: auto;
          height: 100%;
          max-width: 100%;
          object-fit: contain;
        }
      </style>
      <body>
        <main>
          <section>
            <div class="eyebrow">${escapeHtml(eyebrow)}</div>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(description)}</p>
            <div class="proof">Captured from the exact release ZIP</div>
          </section>
          <div class="frame">
            <img alt="${escapeHtml(title)}" src="data:image/png;base64,${productScreenshot.toString('base64')}">
          </div>
        </main>
      </body>
    </html>
  `);
  await frame.screenshot({ path: path.join(screenshotDir, filename) });
  await frame.close();
}

const dappServer = http.createServer((request, response) => {
  if (request.url === '/scopuly-coin-192.png') {
    response.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': dappIcon.length,
      'Cache-Control': 'public, max-age=3600'
    });
    response.end(dappIcon);
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; object-src 'none'; base-uri 'none'",
    'Cache-Control': 'no-store'
  });
  response.end(`<!doctype html>
    <meta charset="utf-8">
    <meta property="og:site_name" content="Pairing QA dApp">
    <link rel="icon" type="image/png" href="/scopuly-coin-192.png">
    <title>Pairing QA dApp</title>`);
});
await new Promise((resolve, reject) => {
  dappServer.once('error', reject);
  dappServer.listen(0, '127.0.0.1', resolve);
});
const dappAddress = dappServer.address();
const dappUrl = reviewerUrl || `http://127.0.0.1:${dappAddress.port}/`;
const dappOrigin = new URL(dappUrl).origin;
const reviewerDappDocument = `<!doctype html>
  <meta charset="utf-8">
  <meta property="og:site_name" content="Scopuly Browser Extension">
  <link rel="icon" type="image/png" href="/scopuly-reviewer-icon.png">
  <title>Scopuly Browser Extension</title>`;
const mobileChannel = await generateMobileChannel();
const now = Date.now();
const pairingExpiresAt = now + 120_000;
const sessionExpiresAt = now + 86_400_000;
let extensionPublicKey = '';
let approvalEnvelope;
let decryptedProviderRequest;
let pairingPosts = 0;
let pairingStatusPolls = 0;
let providerPosts = 0;
let mobileSendCounter = 1;
let providerCancellationPosts = 0;
let sessionDisconnectPosts = 0;
const pendingProviderRelays = new Map();
let releaseFirstSigningResponse = false;
let releaseTransactionResponse = false;
let releaseRejectionResponse = false;
let context;

async function handleBridgeRoute(route) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const authorization = request.headers().authorization;
  const body = request.postData() ? request.postDataJSON() : undefined;

  if (url.pathname.endsWith('/v1/extension/pairings') && method === 'POST') {
    pairingPosts += 1;
    extensionPublicKey = body.extensionPublicKey;
    assert(body.protocolVersion === protocolVersion, 'Pairing protocol version changed.');
    assert(typeof extensionPublicKey === 'string', 'Pairing public key is missing.');
    assert(!('accounts' in body), 'Pairing leaked account metadata to the relay.');
    assert(!('publicKey' in body), 'Pairing leaked a Stellar public key to the relay.');
    return jsonResponse(route, {
      id: pairingId,
      uri: `scopuly://extension/pair?id=${pairingId}&ticket=${pairingTicket}`,
      status: 'pending',
      protocolVersion,
      createdAt: now,
      expiresAt: pairingExpiresAt,
      extensionAccessToken
    }, 201);
  }

  if (url.pathname.endsWith(`/v1/extension/pairings/${pairingId}`)
    && method === 'GET') {
    assert(
      authorization === `Bearer ${extensionAccessToken}`,
      'Pairing status request is not authenticated.'
    );
    pairingStatusPolls += 1;
    if (pairingStatusPolls < 3) {
      return jsonResponse(route, {
        pairing: {
          id: pairingId,
          uri: `scopuly://extension/pair?id=${pairingId}&ticket=${pairingTicket}`,
          status: 'pending',
          protocolVersion,
          createdAt: now,
          expiresAt: pairingExpiresAt
        }
      });
    }
    if (!approvalEnvelope) {
      const approvalKey = await deriveKey(
        mobileChannel.privateKey,
        extensionPublicKey,
        'mobile-to-extension'
      );
      const accounts = signers.map((signer, index) => {
        const proofPayload = pairingProofPayload(
          extensionPublicKey,
          mobileChannel.publicKey,
          accountIds[index],
          signer.publicKey(),
          sessionExpiresAt
        );
        return {
          id: accountIds[index],
          sessionId,
          publicKey: signer.publicKey(),
          name: index === 0 ? 'Review Account' : 'Savings Account',
          supportedNetworks: ['testnet'],
          device: {
            id: 'device-playwright-1',
            name: 'Test iPhone',
            platform: 'ios'
          },
          connectedAt: now,
          lastSeenAt: now,
          pairingProof: pairingProof(proofPayload, signer)
        };
      });
      approvalEnvelope = await encrypt({
        session: {
          id: sessionId,
          transport: 'scopuly-bridge',
          status: 'connected',
          accountIds,
          capabilities: [
            'signTransaction',
            'signAndSubmitTransaction',
            'signMessage',
            'signAuthEntry',
            'reportX402Receipt'
          ],
          createdAt: now,
          expiresAt: sessionExpiresAt,
          lastSeenAt: now,
          protocolVersion
        },
        accounts
      }, approvalKey, {
        sessionId,
        requestId: pairingId,
        direction: 'mobile-to-extension',
        counter: 1,
        expiresAt: pairingExpiresAt
      });
    }
    return jsonResponse(route, {
      pairing: {
        id: pairingId,
        uri: `scopuly://extension/pair?id=${pairingId}&ticket=${pairingTicket}`,
        status: 'approved',
        protocolVersion,
        createdAt: now,
        expiresAt: pairingExpiresAt
      },
      sessionId,
      mobilePublicKey: mobileChannel.publicKey,
      approvalEnvelope
    });
  }

  if (url.pathname.endsWith(`/v1/extension/sessions/${sessionId}`)
    && method === 'GET') {
    assert(
      authorization === `Bearer ${extensionAccessToken}`,
      'Session health request is not authenticated.'
    );
    return jsonResponse(route, {
      status: 'connected',
      protocolVersion,
      sessionId,
      expiresAt: sessionExpiresAt,
      lastActivityAt: Date.now(),
      serverTime: Date.now()
    });
  }

  if (url.pathname.endsWith('/v1/extension/provider-requests')
    && method === 'POST') {
    providerPosts += 1;
    assert(
      authorization === `Bearer ${extensionAccessToken}`,
      'Provider request is not authenticated.'
    );
    assert(!('method' in body), 'Provider method leaked outside encryption.');
    assert(!('message' in body), 'Provider message leaked outside encryption.');
    assert(!('origin' in body), 'Provider origin leaked outside encryption.');
    assert(!('publicKey' in body), 'Provider account leaked outside encryption.');
    const requestKey = await deriveKey(
      mobileChannel.privateKey,
      extensionPublicKey,
      'extension-to-mobile'
    );
    decryptedProviderRequest = await decrypt(body.envelope, requestKey);
    assert(
      ['signMessage', 'signTransaction'].includes(decryptedProviderRequest.method),
      'Unexpected encrypted provider method.'
    );
    assert(
      decryptedProviderRequest.publicKey === signers[0].publicKey(),
      'The dApp request did not use the selected Scopuly account.'
    );
    assert(
      decryptedProviderRequest.networkPassphrase === Networks.TESTNET,
      'The dApp request did not use Testnet.'
    );

    const transportRequestId = `transport-playwright-${providerPosts}`;
    if (decryptedProviderRequest.method === 'signMessage') {
      assert(
        decryptedProviderRequest.messageHash === messageHash(
          decryptedProviderRequest.message
        ),
        'Encrypted message hash does not match SEP-53.'
      );
    } else {
      const transaction = TransactionBuilder.fromXDR(
        decryptedProviderRequest.xdr,
        Networks.TESTNET
      );
      assert(
        decryptedProviderRequest.xdr === testnetTransaction,
        'Encrypted transaction XDR changed in transit.'
      );
      assert(
        decryptedProviderRequest.transactionHash === transaction.hash().toString('hex'),
        'Encrypted transaction hash does not match its XDR.'
      );
      assert(
        decryptedProviderRequest.submit === false,
        'The sign-only smoke request was changed to submit.'
      );
    }
    if (decryptedProviderRequest.method === 'signMessage'
      && [cancelledMessage, expiredMessage].includes(decryptedProviderRequest.message)) {
      pendingProviderRelays.set(transportRequestId, {
        requestId: decryptedProviderRequest.requestId
      });
      return jsonResponse(route, {
        status: 'pending',
        transportRequestId
      }, 201);
    }

    const resultKey = await deriveKey(
      mobileChannel.privateKey,
      extensionPublicKey,
      'mobile-to-extension'
    );
    mobileSendCounter += 1;
    let mobileResult;
    if (decryptedProviderRequest.method === 'signTransaction') {
      const signedTransaction = TransactionBuilder.fromXDR(
        decryptedProviderRequest.xdr,
        Networks.TESTNET
      );
      signedTransaction.sign(signers[0]);
      mobileResult = {
        status: 'completed',
        method: 'signTransaction',
        transportRequestId,
        signedTxXdr: signedTransaction.toEnvelope().toXDR('base64'),
        signerAddress: signers[0].publicKey()
      };
    } else if (decryptedProviderRequest.message === rejectedMessage) {
      mobileResult = {
        status: 'rejected',
        transportRequestId,
        error: 'Rejected in Scopuly.'
      };
    } else {
      mobileResult = {
          status: 'completed',
          method: 'signMessage',
          transportRequestId,
          signedMessage: signers[0]
            .signMessage(decryptedProviderRequest.message)
            .toString('hex'),
          signerAddress: signers[0].publicKey()
      };
    }
    const envelope = await encrypt(mobileResult, resultKey, {
      sessionId,
      requestId: decryptedProviderRequest.requestId,
      direction: 'mobile-to-extension',
      counter: mobileSendCounter,
      expiresAt: decryptedProviderRequest.expiresAt
    });
    const readyResponse = {
      status: 'ready',
      transportRequestId,
      envelope
    };
    if (decryptedProviderRequest.method === 'signTransaction'
      || (decryptedProviderRequest.method === 'signMessage'
        && [message, rejectedMessage].includes(decryptedProviderRequest.message))) {
      pendingProviderRelays.set(transportRequestId, {
        requestId: decryptedProviderRequest.requestId,
        readyResponse,
        responseGate: decryptedProviderRequest.method === 'signTransaction'
          ? 'transaction'
          : decryptedProviderRequest.message === message
            ? 'first-signing'
            : 'rejection'
      });
      return jsonResponse(route, {
        status: 'pending',
        transportRequestId
      }, 201);
    }
    return jsonResponse(route, readyResponse, 201);
  }

  const providerStatusMatch = url.pathname.match(
    /\/v1\/extension\/provider-requests\/([^/]+)$/
  );
  if (providerStatusMatch && method === 'GET') {
    const transportRequestId = decodeURIComponent(providerStatusMatch[1]);
    const pendingRelay = pendingProviderRelays.get(transportRequestId);
    assert(
      pendingRelay,
      'The extension polled an unknown provider request.'
    );
    const responseReleased = pendingRelay.responseGate === 'first-signing'
      ? releaseFirstSigningResponse
      : pendingRelay.responseGate === 'transaction'
        ? releaseTransactionResponse
      : pendingRelay.responseGate === 'rejection'
        ? releaseRejectionResponse
        : false;
    if (pendingRelay.readyResponse && responseReleased) {
      pendingProviderRelays.delete(transportRequestId);
      return jsonResponse(route, pendingRelay.readyResponse);
    }
    return jsonResponse(route, { status: 'pending', transportRequestId });
  }

  if (providerStatusMatch && method === 'DELETE') {
    providerCancellationPosts += 1;
    assert(
      authorization === `Bearer ${extensionAccessToken}`,
      'Provider cancellation is not authenticated.'
    );
    const requestKey = await deriveKey(
      mobileChannel.privateKey,
      extensionPublicKey,
      'extension-to-mobile'
    );
    const cancellation = await decrypt(body.envelope, requestKey);
    assert(cancellation.action === 'cancel', 'Provider cancellation action changed.');
    assert(
      cancellation.requestId === body.requestId,
      'Provider cancellation request ID changed.'
    );
    pendingProviderRelays.delete(decodeURIComponent(providerStatusMatch[1]));
    return route.fulfill({ status: 204 });
  }

  if (url.pathname.endsWith(`/v1/extension/sessions/${sessionId}`)
    && method === 'DELETE') {
    sessionDisconnectPosts += 1;
    assert(
      authorization === `Bearer ${extensionAccessToken}`,
      'Session disconnect is not authenticated.'
    );
    const requestKey = await deriveKey(
      mobileChannel.privateKey,
      extensionPublicKey,
      'extension-to-mobile'
    );
    const disconnect = await decrypt(body.envelope, requestKey);
    assert(disconnect.action === 'disconnect', 'Session disconnect action changed.');
    assert(disconnect.sessionId === sessionId, 'Session disconnect ID changed.');
    return route.fulfill({ status: 204 });
  }

  return jsonResponse(route, { error: `Unexpected mock route: ${method} ${url.pathname}` }, 404);
}

async function launchExtensionContext() {
  const nextContext = await chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  await nextContext.route(bridgePattern, handleBridgeRoute);
  if (reviewerUrl) {
    await nextContext.route(`${dappOrigin}/**`, (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/scopuly-reviewer-icon.png') {
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: dappIcon
        });
      }
      if (request.resourceType() === 'document') {
        return route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          headers: {
            'Content-Security-Policy': "default-src 'none'; img-src 'self'; object-src 'none'; base-uri 'none'",
            'Cache-Control': 'no-store'
          },
          body: reviewerDappDocument
        });
      }
      return route.abort();
    });
  }
  return nextContext;
}

try {
  context = await launchExtensionContext();
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 390, height: 760 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: 'Connect Scopuly' }).click();
  await popup.locator('.pairing-qr').waitFor();
  const qrPresentation = await popup.locator('.pairing-qr').evaluate(async (element) => {
    const image = element;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const start = Math.floor(image.naturalWidth * .42);
    const size = Math.floor(image.naturalWidth * .16);
    const pixels = context.getImageData(start, start, size, size).data;
    let brandedPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue] = pixels.subarray(index, index + 3);
      if (blue > red + 35 && blue > green + 20) brandedPixels += 1;
    }
    return {
      source: image.src.slice(0, 22),
      width: image.naturalWidth,
      brandedPixels
    };
  });
  assert(
    qrPresentation.source === 'data:image/png;base64,'
      && qrPresentation.width >= 500
      && qrPresentation.brandedPixels > 100,
    `Pairing QR is missing its branded center mark: ${JSON.stringify(qrPresentation)}`
  );
  await popup.locator('.pairing-qr').evaluate((element) => {
    element.dataset.stabilityMarker = 'keep-this-node';
  });
  await popup.waitForTimeout(2_200);
  assert(
    await popup.locator('.pairing-qr').getAttribute('data-stability-marker') === 'keep-this-node',
    'Pending pairing replaced the QR DOM node during its countdown.'
  );
  await captureStoreAsset(
    popup,
    'scopuly-store-pairing-1280x800.png',
    'ENCRYPTED SCOPULY PAIRING',
    'Pair once with the Scopuly app.',
    'Scan a short-lived QR code on mobile or copy the pairing link into Scopuly for Mac.'
  );
  await popup.waitForFunction(() => (
    document.querySelector('.premium-account-card')
  ), null, { timeout: 15_000 });

  assert(
    await popup.locator('.home-account-list .mobile-account-row').count() === 2,
    'The paired dashboard does not expose both Scopuly accounts.'
  );
  const uiFonts = await popup.evaluate(() => {
    const selectors = [
      'body',
      '.status-hero h1',
      '.premium-account-card h2',
      '.quick-action',
      '.home-accounts-panel h2',
      '.home-account-list .mobile-account-info b'
    ];
    return selectors.map((selector) => ({
      selector,
      fontFamily: getComputedStyle(document.querySelector(selector)).fontFamily
    }));
  });
  assert(
    uiFonts.every(({ fontFamily }) => fontFamily.includes('Baloo 2')),
    `Regular UI text does not consistently use Baloo 2: ${JSON.stringify(uiFonts)}`
  );
  await popup.getByRole('button', { name: 'Switch to light theme' }).click();
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await popup.getByRole('button', { name: 'Switch to dark theme' }).click();
  await popup.waitForFunction(() => document.documentElement.dataset.theme === 'dark');

  await captureStoreAsset(
    popup,
    'scopuly-store-dashboard-1280x800.png',
    'SECURE SIGNER CONTROL CENTER',
    'Scopuly stays the final signer.',
    'Choose a Scopuly account, review connected dApps and keep final approval in your paired app.'
  );

  await popup.setViewportSize({ width: 320, height: 760 });
  const popupNarrowLayout = await popup.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  assert(
    popupNarrowLayout.documentWidth <= popupNarrowLayout.viewportWidth,
    `Paired popup 320px fallback overflows: ${JSON.stringify(popupNarrowLayout)}`
  );
  await popup.setViewportSize({ width: 390, height: 760 });

  await popup.getByRole('button', { name: 'Manage accounts', exact: true }).click();
  await popup.waitForFunction(() => (
    document.querySelectorAll('.mobile-account-info b').length === 2
  ));

  const accountNames = await popup.locator('.mobile-account-info b').allTextContents();
  assert(
    JSON.stringify(accountNames) === JSON.stringify(['Review Account', 'Savings Account']),
    `Multi-account pairing rendered unexpected accounts: ${JSON.stringify(accountNames)}`
  );
  await popup.getByRole('button', { name: 'Go back' }).click();
  await popup.getByRole('button', { name: /Default network:/ }).click();
  await popup.getByRole('button', { name: /^Testnet/ }).click();

  const storedState = await serviceWorker.evaluate(async () => chrome.storage.local.get([
    'scopuly.mobileAccounts',
    'scopuly.mobileSessions',
    'scopuly.selectedMobileAccount',
    'scopuly.pairing'
  ]));
  assert(
    storedState['scopuly.mobileAccounts']?.length === 2,
    'The exact ZIP did not persist both approved Scopuly accounts.'
  );
  assert(
    storedState['scopuly.mobileSessions']?.[0]?.channel?.privateKeyId,
    'The exact ZIP did not persist its non-exported channel key reference.'
  );
  assert(
    storedState['scopuly.selectedMobileAccount'] === accountIds[0],
    'The exact ZIP selected the wrong paired account.'
  );
  assert(
    !storedState['scopuly.pairing'],
    'The single-use pairing request remained after approval.'
  );

  const dapp = await context.newPage();
  await dapp.goto(dappUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dapp.waitForFunction(() => Boolean(window.scopuly?.isScopuly));

  const accessPromise = dapp.evaluate(() => window.scopuly.requestAccess());
  const accessConfirmation = await waitForExtensionPage(context, '/confirm.html');
  if (!reviewerUrl) {
    const requestIcon = await accessConfirmation
      .locator('.request-site .site-avatar')
      .getAttribute('src');
    assert(
      requestIcon?.startsWith('data:image/png;base64,'),
      'The dApp favicon was not safely snapshotted into the request window.'
    );
  }
  await accessConfirmation.setViewportSize({ width: 320, height: 720 });
  const accessNarrowLayout = await accessConfirmation.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  assert(
    accessNarrowLayout.documentWidth <= accessNarrowLayout.viewportWidth,
    `Account access 320px fallback overflows: ${JSON.stringify(accessNarrowLayout)}`
  );
  await captureStoreAsset(
    accessConfirmation,
    'scopuly-store-account-access-1280x800.png',
    'EXPLICIT DAPP ACCESS',
    'Share only the account you choose.',
    'A website receives a public Stellar address only after you approve the connection.'
  );
  await accessConfirmation.getByRole('button', { name: 'Connect site' }).click();
  const access = await accessPromise;
  assert(
    access.address === signers[0].publicKey(),
    'The dApp received the wrong connected public account.'
  );
  await dapp.waitForFunction(() => window.scopuly.isConnected().then(
    (state) => state.isConnected === true
  ));
  await popup.reload();
  await popup.locator('.dapp-row').waitFor();
  if (!reviewerUrl) {
    const connectedIcon = await popup.locator('.dapp-row .site-avatar').getAttribute('src');
    assert(
      connectedIcon?.startsWith('data:image/png;base64,'),
      'The connected dApp did not retain its local favicon snapshot.'
    );
  }
  await captureStoreAsset(
    popup,
    'scopuly-store-dashboard-1280x800.png',
    'SECURE SIGNER CONTROL CENTER',
    'Scopuly stays the final signer.',
    'Choose a Scopuly account, review connected dApps and keep final approval in your paired app.'
  );

  const signingPromise = dapp.evaluate(
    (requestMessage) => window.scopuly.signMessage(requestMessage, { network: 'testnet' }),
    message
  );
  const signingConfirmation = await waitForExtensionPage(context, '/confirm.html');
  await signingConfirmation.locator('pre.message-preview').waitFor();
  assert(
    await signingConfirmation.locator('pre.message-preview').textContent() === message,
    'The confirmation window did not show the exact message.'
  );
  await signingConfirmation.locator('.status-awaitingMobile').waitFor();
  await captureStoreAsset(
    signingConfirmation,
    'scopuly-store-mobile-waiting-1280x800.png',
    'SCOPULY APPROVAL',
    'Browser requests wait for Scopuly.',
    'The extension displays the exact request while your paired Scopuly app remains the final signer.'
  );
  releaseFirstSigningResponse = true;
  const signed = await signingPromise;
  assert(
    signed.signerAddress === signers[0].publicKey(),
    'The verified dApp response used the wrong signer.'
  );
  assert(
    /^[a-f0-9]{128}$/.test(signed.signedMessage),
    'The dApp did not receive a verified SEP-53 signature.'
  );
  await signingConfirmation.locator('.status-completed').waitFor();
  await captureStoreAsset(
    signingConfirmation,
    'scopuly-store-success-1280x800.png',
    'VERIFIED RESULT',
    'The signed result returns to the dApp.',
    'Scopuly verifies the signer response before returning the SEP-53 signature to the requesting website.'
  );
  await signingConfirmation.close();

  const transactionSigningPromise = dapp.evaluate(
    (xdr) => window.scopuly.signTransaction(xdr, { network: 'testnet' }),
    testnetTransaction
  );
  const transactionConfirmation = await waitForExtensionPage(context, '/confirm.html');
  await transactionConfirmation.locator('.op-row').waitFor();
  await transactionConfirmation.setViewportSize({ width: 320, height: 720 });
  const transactionNarrowLayout = await transactionConfirmation.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  assert(
    transactionNarrowLayout.documentWidth <= transactionNarrowLayout.viewportWidth,
    `Transaction review 320px fallback overflows: ${JSON.stringify(transactionNarrowLayout)}`
  );
  await transactionConfirmation.setViewportSize({ width: 430, height: 720 });
  assert(
    /Payment/i.test(await transactionConfirmation.locator('.op-row').textContent()),
    'The transaction confirmation did not render its payment operation.'
  );
  const transactionLayout = await transactionConfirmation.evaluate(() => ({
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight,
    appHeight: document.querySelector('.confirm-app')?.scrollHeight || 0,
    operationBottom: document.querySelector('.op-row')?.getBoundingClientRect().bottom || 0
  }));
  assert(
    Math.max(
      transactionLayout.documentHeight,
      transactionLayout.bodyHeight,
      transactionLayout.appHeight
    ) > transactionLayout.viewportHeight
      && transactionLayout.operationBottom > transactionLayout.viewportHeight,
    `Long transaction review is not scrollable: ${JSON.stringify(transactionLayout)}`
  );
  await transactionConfirmation.locator('.status-awaitingMobile').waitFor();
  await captureStoreAsset(
    transactionConfirmation,
    'scopuly-store-mobile-waiting-1280x800.png',
    'SCOPULY TRANSACTION REVIEW',
    'Review every Stellar transaction in Scopuly.',
    'See the operation, amount, destination, fee and network before your paired app gives final approval.',
    { focusSelector: '.request-context', focusOffset: 12 }
  );
  releaseTransactionResponse = true;
  const signedTransactionResult = await transactionSigningPromise;
  const decodedSignedTransaction = TransactionBuilder.fromXDR(
    signedTransactionResult.signedXDR,
    Networks.TESTNET
  );
  assert(
    signedTransactionResult.signerAddress === signers[0].publicKey()
      && signedTransactionResult.signedXDR !== testnetTransaction
      && decodedSignedTransaction.signatures.length === 1,
    'The dApp did not receive the verified signed Testnet XDR.'
  );
  await transactionConfirmation.locator('.status-completed').waitFor();
  await captureStoreAsset(
    transactionConfirmation,
    'scopuly-store-success-1280x800.png',
    'VERIFIED TRANSACTION RESULT',
    'A verified signed XDR returns to the dApp.',
    'Scopuly checks the signer response and account before returning the signed Testnet transaction.',
    { focusSelector: '.request-context', focusOffset: 12 }
  );
  await transactionConfirmation.close();

  await popup.close();
  await dapp.close();
  await context.close();
  context = undefined;

  context = await launchExtensionContext();
  serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  }
  assert(
    new URL(serviceWorker.url()).host === extensionId,
    'The exact ZIP extension ID changed after Chromium restart.'
  );

  const restartedDapp = await context.newPage();
  await restartedDapp.goto(dappUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await restartedDapp.waitForFunction(() => Boolean(window.scopuly?.isScopuly));
  const restartedConnection = await restartedDapp.evaluate(
    () => window.scopuly.isConnected()
  );
  assert(
    restartedConnection.isConnected === true,
    'The dApp connection did not survive Chromium restart.'
  );

  const restartSigningPromise = restartedDapp.evaluate(
    (requestMessage) => window.scopuly.signMessage(requestMessage, { network: 'testnet' }),
    restartMessage
  );
  const restartConfirmation = await waitForExtensionPage(context, '/confirm.html');
  await restartConfirmation.locator('pre.message-preview').waitFor();
  const restartSigned = await restartSigningPromise;
  assert(
    restartSigned.signerAddress === signers[0].publicKey(),
    'The persisted non-exported channel key failed after Chromium restart.'
  );
  await restartConfirmation.close();

  const rejectionPromise = restartedDapp.evaluate(async (requestMessage) => {
    try {
      await window.scopuly.signMessage(requestMessage, { network: 'testnet' });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error?.code, message: error?.message };
    }
  }, rejectedMessage);
  const rejectionConfirmation = await waitForExtensionPage(context, '/confirm.html');
  await rejectionConfirmation.locator('pre.message-preview').waitFor();
  const restartedDappSession = await context.newCDPSession(restartedDapp);
  await restartedDappSession.send('Debugger.enable');
  await restartedDappSession.send('Debugger.pause');
  releaseRejectionResponse = true;
  await rejectionConfirmation.locator('.status-rejected').waitFor();
  await captureStoreAsset(
    rejectionConfirmation,
    'scopuly-store-rejection-1280x800.png',
    'SAFE REJECTION',
    'Reject safely in Scopuly.',
    'A rejection in the paired app returns to the original website as a stable wallet error.'
  );
  await restartedDappSession.send('Debugger.resume');
  await restartedDappSession.detach();
  const rejection = await rejectionPromise;
  assert(
    rejection.ok === false
      && rejection.code === -4
      && /rejected/i.test(rejection.message),
    `Mobile rejection was not returned to the dApp: ${JSON.stringify(rejection)}`
  );
  await rejectionConfirmation.close();

  const cancellationPromise = restartedDapp.evaluate(async (requestMessage) => {
    try {
      await window.scopuly.signMessage(requestMessage, { network: 'testnet' });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error?.code, message: error?.message };
    }
  }, cancelledMessage);
  const cancellationConfirmation = await waitForExtensionPage(context, '/confirm.html');
  await cancellationConfirmation
    .getByRole('button', { name: 'Cancel request' })
    .click();
  const cancellation = await cancellationPromise;
  assert(
    cancellation.ok === false
      && cancellation.code === -4
      && /cancelled/i.test(cancellation.message),
    `Browser cancellation was not returned to the dApp: ${JSON.stringify(cancellation)}`
  );

  const expiryPromise = restartedDapp.evaluate(async (requestMessage) => {
    try {
      await window.scopuly.signMessage(requestMessage, { network: 'testnet' });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error?.code, message: error?.message };
    }
  }, expiredMessage);
  const expiryConfirmation = await waitForExtensionPage(context, '/confirm.html');
  await expiryConfirmation
    .getByRole('button', { name: 'Cancel request' })
    .waitFor();
  const expiryRecordChanged = await serviceWorker.evaluate(async (requestMessage) => {
    const key = 'scopuly.pendingRequests';
    const stored = await chrome.storage.local.get(key);
    const requests = stored[key] || [];
    const target = requests.find((request) => (
      request.message === requestMessage && request.status === 'awaitingMobile'
    ));
    if (!target) return false;
    target.expiresAt = Date.now() - 1;
    await chrome.storage.local.set({ [key]: requests });
    return true;
  }, expiredMessage);
  assert(expiryRecordChanged, 'Could not force the pending exact-ZIP request to expire.');
  const expiry = await expiryPromise;
  assert(
    expiry.ok === false
      && expiry.code === -3
      && /expired/i.test(expiry.message),
    `Request expiry was not returned to the dApp: ${JSON.stringify(expiry)}`
  );
  await expiryConfirmation.close();

  await restartedDapp.evaluate(() => window.scopuly.disconnect());
  const disconnected = await restartedDapp.evaluate(() => window.scopuly.isConnected());
  assert(
    disconnected.isConnected === false,
    'The dApp remained connected after provider disconnect.'
  );

  const restartedPopup = await context.newPage();
  await restartedPopup.setViewportSize({ width: 390, height: 760 });
  await restartedPopup.goto(`chrome-extension://${extensionId}/popup.html`);
  await restartedPopup.getByRole('button', { name: 'Scopuly accounts' }).click();
  await restartedPopup.locator('.mobile-account-row').first().waitFor();
  await restartedPopup.getByRole('button', { name: 'Disconnect device' }).first().click();
  await restartedPopup.locator('dialog').getByRole('button', { name: 'Disconnect device' }).click();
  await restartedPopup
    .getByRole('button', { name: 'Connect Scopuly' })
    .waitFor();
  const disconnectedStorage = await serviceWorker.evaluate(
    async () => chrome.storage.local.get([
      'scopuly.mobileAccounts',
      'scopuly.mobileSessions',
      'scopuly.selectedMobileAccount'
    ])
  );
  assert(
    disconnectedStorage['scopuly.mobileAccounts']?.length === 0
      && disconnectedStorage['scopuly.mobileSessions']?.length === 0
      && !disconnectedStorage['scopuly.selectedMobileAccount'],
    'Mobile session data remained after session disconnect.'
  );

  assert(pairingPosts === 1, `Expected one pairing POST, received ${pairingPosts}.`);
  assert(providerPosts === 6, `Expected six provider POSTs, received ${providerPosts}.`);
  assert(
    providerCancellationPosts === 1,
    `Expected one provider cancellation, received ${providerCancellationPosts}.`
  );
  assert(
    sessionDisconnectPosts === 1,
    `Expected one session disconnect, received ${sessionDisconnectPosts}.`
  );
  assert(
    decryptedProviderRequest?.origin === dappOrigin,
    'The encrypted request origin did not match the requesting dApp.'
  );
  console.log(
    `Exact-ZIP pairing flow passed for extension ${extensionId}: `
      + '2 accounts, dApp access, verified Testnet XDR and SEP-53 signing, '
      + 'restart, rejection, cancellation, expiry and disconnect.'
  );
} finally {
  await context?.close();
  await new Promise((resolve) => dappServer.close(resolve));
  if (profilePath.startsWith(os.tmpdir())) {
    fs.rmSync(profilePath, { recursive: true, force: true });
  }
  if (extensionPath.startsWith(os.tmpdir())) {
    fs.rmSync(extensionPath, { recursive: true, force: true });
  }
}
