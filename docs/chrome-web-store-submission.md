# Chrome Web Store Update Sheet

Use this sheet to update the existing Chrome listing from `0.3.2` to `0.3.4`.

## Existing publication

- Extension ID: `gfblddiiepicpjpffokeojikcphggmmd`
- Public listing: `https://chromewebstore.google.com/detail/scopuly-stellar-mobile-si/gfblddiiepicpjpffokeojikcphggmmd`
- Current public version before submission: `0.3.2`

## Package

- Upload: `release/scopuly-stellar-signer-chromium-v0.3.4.zip`
- SHA-256: see `release/SHA256SUMS-v0.3.4.txt`
- Manifest: version 3
- Visibility: Public

Do not upload the source ZIP, a CRX file, the `dist` directory or a ZIP that
contains another ZIP.

## Store listing

- Name: `Scopuly – Stellar Signer`
- Language: English
- Category: Tools
- Homepage URL: `https://extension.scopuly.com/`
- Support URL: `https://extension.scopuly.com/support/`
- Official URL: `https://scopuly.com/`
- Privacy policy URL: `https://extension.scopuly.com/policy/`

Use the short and detailed descriptions from [`store-listing.md`](store-listing.md).

## Graphic assets

Upload in this order:

1. `docs/store-assets/scopuly-store-dashboard-1280x800.png`
2. `docs/store-assets/scopuly-store-pairing-1280x800.png`
3. `docs/store-assets/scopuly-store-account-access-1280x800.png`
4. `docs/store-assets/scopuly-store-mobile-waiting-1280x800.png`
5. `docs/store-assets/scopuly-store-success-1280x800.png`

Additional listing images:

- Small promo tile: `docs/store-assets/scopuly-promo-440x280.png`
- Marquee image: `docs/store-assets/scopuly-marquee-1400x560.png`

The legacy `mobile-waiting` filename is internal; the regenerated image and
caption use cross-platform Scopuly wording.

## Single purpose

> Bridge Stellar dApps in the browser to a paired Scopuly app for explicit
> account access, signing, transaction submission and verified result delivery.

## Permission justifications

### storage

> Stores paired public accounts, settings, user-approved dApp permissions and
> short-lived pending request state across browser and Manifest V3 service
> worker restarts. Secret keys and seed phrases are never stored.

### Host access: https://api.scopuly.com/*

> Sends short-lived pairing and encrypted provider envelopes to the Scopuly
> Bridge. The host is fixed at build time. It returns data only for the paired
> signer flow and never supplies executable code.

### Broad site access / content script match: <all_urls>

> Makes the `window.scopuly` provider discoverable when a Stellar dApp
> explicitly calls it. The content scripts do not read general page content,
> cookies, form data or browsing history. They relay only explicit provider
> requests and derive the trusted requesting origin from the browser runtime.

## Remote code

Select **No, I am not using remote code.** All executable JavaScript, HTML, CSS
and fonts are bundled in the extension package. Network responses contain data
only.

## Data disclosures

Disclose conservatively:

- public Stellar account addresses and user-assigned account/device labels;
- transaction XDR, transaction details, Soroban authorization entries and
  receipt identifiers;
- pairing/session identifiers and short-lived routing credentials;
- messages explicitly submitted for wallet signing.

Do not select health information, location, general browsing history or general
website content. Certify that data is not sold, used for advertising or used
for purposes unrelated to the extension's single purpose.

## Reviewer test instructions

No Scopuly web account credentials are required. A compatible Scopuly app with
one public Stellar account is required.

1. Install Scopuly on iOS or Android. Scopuly for Mac is also supported.
2. Install the submitted extension and open its toolbar popup.
3. Select **Connect Scopuly**. Scan the QR code on iOS/Android, or select
   **Copy link** and open the pairing link in Scopuly for Mac.
4. Open `https://extension.scopuly.com/playground/`.
5. Select **Testnet**, request account access and approve the exact origin.
6. Request a message signature or Testnet transaction signature. No funds are
   required when submission is disabled.
7. Reject one request, retry it, approve it in Scopuly and confirm the verified
   result returns only to the requesting page.
8. Disconnect the dApp and confirm later requests require access again.

The extension never asks the reviewer to enter a secret key or seed phrase in
the browser.

## Final pre-submit checks

- The final ZIP passes the exact-package smoke test.
- The privacy, support, homepage and playground URLs return HTTP 200.
- The screenshots were captured from the exact ZIP being submitted.
- The production Bridge is reachable over HTTPS.
- The package SHA-256 matches `release/SHA256SUMS-v0.3.4.txt`.
