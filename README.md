# Scopuly Browser Extension

[![CI](https://github.com/Scopuly/scopuly-browser-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/Scopuly/scopuly-browser-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Scopuly is a Manifest V3 browser extension that connects Stellar dApps to a
paired Scopuly signer. The extension handles dApp access, request review and
result verification without storing wallet secret keys or seed phrases.

## Product model

- The browser extension injects `window.scopuly` into dApps.
- A user pairs a Scopuly signer by scanning a QR code.
- The extension approves which public account a dApp may see.
- Transaction, message, Soroban authorization, submit and x402 receipt requests
  are reviewed in the browser and forwarded to the paired signer.
- The paired signer independently approves and performs the final operation.
- The extension independently verifies the returned transaction, signature or
  receipt identity before answering the dApp.
- Secret keys and seed phrases never enter the extension.

The transport is isolated behind `MobileSignerTransport`, keeping network
delivery separate from the provider, security checks and user interface.

## Current stage

The extension implements provider protocol `0.3.0`, encrypted pairing,
persistent requests, explicit dApp permissions and method-specific result
verification. Automated checks cover account access, transaction and message
requests, worker restart, rejection, cancellation, expiry and disconnect.

Browser-store release still requires validation of the final archives in every
target browser, final reviewer assets, published policy URLs and an independent
extension security review. See the
[publication checklist](docs/publication-checklist.md).

## Development

Use Node.js 22 or newer.

```bash
npm install
npm run check
npm test
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run build
```

The production bridge URL is injected at build time. Distributable builds fail if it is missing or outside `https://api.scopuly.com`.

Load `dist/` as an unpacked extension in Chrome, Brave, or Edge.

## Release packages

```bash
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run package:chromium
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run package:edge
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run package:firefox
npm run package:source
npm run reproduce:firefox
npm run smoke:chromium:reviewer-assets
npm run check:store-assets
```

Archives are written to `release/`. The Firefox source archive excludes
dependencies, generated builds, CRX/PEM files, and release artifacts.
`reproduce:firefox` installs the source ZIP in a clean temporary directory,
runs its tests, rebuilds Firefox and requires an exact SHA-256 match with the
release ZIP.
The reviewer-assets smoke captures real 1280x800 pairing, access, waiting,
success and rejection states from the exact Chromium ZIP.

## Provider API

```js
const { address } = await window.scopuly.requestAccess();
const { signedTxXdr } = await window.scopuly.signTransaction(xdr, {
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
});

const { signedMessage } = await window.scopuly.signMessage('Approve order #42');
```

The injected extension provider uses contract version `0.3.0`. Its complete
runtime contract and error codes are documented in
[Provider API](docs/wallet-provider.md). The legacy `connect()` alias remains
available for existing extension integrations.
TypeScript dApps can use
[`@scopuly/signer-extension-api`](https://www.npmjs.com/package/@scopuly/signer-extension-api)
for the canonical provider types and delegate functions. The Developer
Playground uses that package directly.
An optional Stellar Wallets Kit 2.5 module is included under
`integrations/stellar-wallets-kit/`; it does not add runtime weight to the
extension.

See [Provider API](docs/wallet-provider.md),
[Architecture](docs/architecture.md), and the
[publication checklist](docs/publication-checklist.md).

## Developer Playground

The [live Developer Playground](https://playground.scopuly.com/) is backed by
the open-source [`examples/developer-playground/`](examples/developer-playground/)
example. It is a minimal provider integration and physical-device manual QA
surface. It exercises explicit account access, background message signing, a
safe no-value `manageData` transaction with an explicit Public/Testnet selector,
optional submission, Soroban authorization input, x402 receipt reporting,
rejection and disconnect. It is built separately and is never included in the
extension package.

```bash
npm run playground:dev
npm run smoke:playground
```

## License

Source code is MIT licensed. Scopuly branding and product assets are excluded
from the MIT trademark grant; see [TRADEMARKS.md](TRADEMARKS.md).

Security issues must be reported privately as described in
[SECURITY.md](SECURITY.md). General support and privacy questions can be sent to
[info@scopuly.com](mailto:info@scopuly.com).
