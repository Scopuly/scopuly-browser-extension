# Firefox Add-ons Submission

Use this sheet for the first public Firefox Desktop submission of Scopuly
version `0.3.2`.

## Packages

- Extension upload: `release/scopuly-mobile-signer-firefox-v0.3.2.zip`
- Extension SHA-256: `499b063d62e536c35e64a16e03570822443af05709ed85590966a61f732bcd68`
- Source upload: `release/scopuly-mobile-signer-source-v0.3.2.zip`
- Source SHA-256: `69ad122b9b48b21b88b2a12e0b9d063ab021bfc4ab03dea4cb021fb736028eee`
- Add-on ID: `extension@scopuly.com`
- Minimum Firefox: `140.0`
- Distribution: On this site / Listed
- Platform: Firefox Desktop only
- Published: August 14, 2026
- Public listing: `https://addons.mozilla.org/en-US/firefox/addon/scopuly-stellar-signer/`

The extension uses a Firefox event-page background and the built-in data
collection consent manifest. Do not select Firefox for Android until its popup,
window and same-device mobile-pairing flows have been tested separately.

## Source build instructions

The source package is required because Vite bundles TypeScript and dependencies.
Mozilla reviewers can reproduce the submitted ZIP with Node.js 22 or newer:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run package:firefox
```

Local verification:

```bash
npm run smoke:firefox:archive
npm run reproduce:firefox
```

The reproduced archive must have SHA-256
`499b063d62e536c35e64a16e03570822443af05709ed85590966a61f732bcd68`.

## Listing and data disclosure

Use the listing copy, public URLs and screenshots from
[`store-listing.md`](store-listing.md). The Firefox manifest declares the
required data categories `financialAndPaymentInfo` and `websiteActivity`.
These cover explicit transaction/signing payloads and the requesting dApp
origin/action relayed for the user-requested wallet operation. The extension
does not monitor general browsing activity.

## Reviewer notes

Use the reviewer path from [`publication-checklist.md`](publication-checklist.md).
No web account credentials are required. Scopuly Mobile is required for pairing
and final signing approval. Use `https://extension.scopuly.com/playground/` on
Testnet so no funds are required.

## Verified locally

- `web-ext lint`: 0 errors, 0 warnings, 0 notices.
- Exact-package Firefox 151 smoke: passed.
- Clean source reproduction: passed with the expected SHA-256.
