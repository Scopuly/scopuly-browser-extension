# Firefox Add-ons Update Sheet

Use this sheet to update the listed Firefox Desktop add-on from `0.3.2` to
`0.3.4`.

## Existing publication

- Add-on ID: `extension@scopuly.com`
- Public listing: `https://addons.mozilla.org/en-US/firefox/addon/scopuly-stellar-signer/`
- Current public version before submission: `0.3.2`
- Platform: Firefox Desktop only

Do not select Firefox for Android until its popup, window and same-device
pairing flows have been tested separately.

## Packages

- Extension upload: `release/scopuly-stellar-signer-firefox-v0.3.4.zip`
- Source upload: `release/scopuly-stellar-signer-source-v0.3.4.zip`
- SHA-256 values: see `release/SHA256SUMS-v0.3.4.txt`
- Minimum Firefox: `140.0`
- Distribution: On this site / Listed

The extension uses a Firefox event-page background and the built-in data
collection consent manifest.

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

The source ZIP excludes generated output, dependencies, credentials and the
deferred Stellar Wallets Kit prototype because none of them is needed to build
the submitted Firefox package.

## Listing and data disclosure

Use the name, listing copy, public URLs and screenshots from
[`store-listing.md`](store-listing.md). The Firefox manifest declares the
required data categories `financialAndPaymentInfo` and `websiteActivity`.
These cover explicit transaction/signing payloads and the requesting dApp
origin/action. The extension does not monitor general browsing activity.

## Reviewer notes

No web account credentials are required. Pair Scopuly by scanning the QR code
on iOS/Android, or by copying the pairing link into Scopuly for Mac. Use
`https://extension.scopuly.com/playground/` on Testnet so no funds are required.

Before submission, require `web-ext lint`, exact-package Firefox smoke and clean
source reproduction to pass with the hashes recorded in
`release/SHA256SUMS-v0.3.4.txt`.
