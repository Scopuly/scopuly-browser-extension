# Browser Store Listings

## Published versions before the 0.3.4 update

- Chrome Web Store: `0.3.2`, extension ID
  `gfblddiiepicpjpffokeojikcphggmmd`, published August 11, 2026.
- Firefox Add-ons: `0.3.2`, add-on ID `extension@scopuly.com`, published
  August 14, 2026.
- Microsoft Edge Add-ons: `0.3.2`, extension ID
  `dgdmamodkdcafjehfelpcnifpldbfmai`, published August 15, 2026.

The next submission is version `0.3.4` in all three stores.

## Name

Scopuly – Stellar Signer

## Short description

Connect Stellar dApps to Scopuly. Review account access and signing requests without exposing secret keys to the extension.

## Detailed description

Scopuly – Stellar Signer connects Stellar Network applications in your browser
to the Scopuly app on your signing device. It provides an explicit Stellar
signer connection for transactions, messages and Soroban requests.

Pair by scanning a short-lived QR code on iOS or Android, or copy the pairing
link into Scopuly for Mac. Choose which public account a website may use and
keep final approval in Scopuly. The extension handles transaction signing and
submission, SEP-53 messages, Soroban authorization entries and Scopuly x402
receipts. Scopuly independently reviews every sensitive operation.

Key properties:

- final approval and signing happen in the paired Scopuly app;
- secret keys and seed phrases never enter the browser extension;
- returned transactions, messages and Soroban signatures are independently
  verified by the extension;
- only the public key paired with the dApp is accepted as signer;
- Stellar Mainnet and Testnet support;
- explicit dApp connection management;
- no ads, analytics, sale of data or remote executable code.

A compatible Scopuly app on iOS, Android or macOS is required. This extension
does not create, import or recover wallets.

Encrypted provider requests and results are relayed through the Scopuly Bridge
only to deliver the requested wallet operation. The relay sees short-lived
routing metadata but cannot decrypt provider payloads.

## Category

Tools

## Public URLs

- Homepage: `https://extension.scopuly.com/`
- Support: `https://extension.scopuly.com/support/`
- Privacy policy: `https://extension.scopuly.com/policy/`
- Developer website: `https://scopuly.com/`
- Source repository: `https://github.com/Scopuly/scopuly-browser-extension`
- Developer playground: `https://extension.scopuly.com/playground/`
- Chrome: `https://chromewebstore.google.com/detail/scopuly-stellar-mobile-si/gfblddiiepicpjpffokeojikcphggmmd`
- Firefox: `https://addons.mozilla.org/en-US/firefox/addon/scopuly-stellar-signer/`
- Edge: `https://microsoftedge.microsoft.com/addons/detail/dgdmamodkdcafjehfelpcnifpldbfmai`

## Single purpose

Bridge Stellar dApps in the browser to a paired Scopuly app for explicit
account access, signing, transaction submission and verified result delivery.

## Required disclosures

- Dependency: a compatible Scopuly app and network connection are required.
- Data transmission: encrypted provider requests and results are relayed through
  the Scopuly Bridge solely to deliver the requested wallet operation. The relay
  receives routing metadata but cannot decrypt application payloads.
- No local wallet: the extension cannot sign without the paired Scopuly app.
- Push delivery: background push applies to iOS and Android. Scopuly for Mac
  receives requests while the app is open; this does not require another
  browser permission or Bridge deployment.

## Search terms

Scopuly, Stellar, XLM, browser wallet, transaction signer, dApp wallet, macOS.

Avoid unsupported claims such as “most secure”, “audited” or “non-custodial”
until the published extension release has evidence for them.

## Chrome screenshot upload order

Chrome accepts no more than five screenshots. Upload only these final captures
from the exact `0.3.4` Chromium ZIP:

1. connected control center;
2. encrypted Scopuly pairing;
3. explicit dApp account access;
4. transaction waiting for Scopuly review;
5. verified transaction result.

Keep onboarding and rejection captures for reviewer notes, support and other
stores. Never upload an image that is not present in the release package.

Generate reviewer assets only from the final versioned Chromium ZIP and a
controlled HTTPS reviewer origin:

```sh
SCOPULY_REVIEWER_URL=https://extension.scopuly.com/playground/ npm run smoke:chromium:reviewer-assets
```

The capture command refuses localhost and non-HTTPS origins. Regenerate the
files after any release ZIP change.
