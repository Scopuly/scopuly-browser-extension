# Chrome Web Store Submission Sheet

Use this sheet for the first public submission of Scopuly version `0.3.2`.
Values are intentionally limited to the browser extension.

## Package

- Upload: `release/scopuly-mobile-signer-chromium-v0.3.2.zip`
- SHA-256: generated in `release/SHA256SUMS-v0.3.2.txt`
- Manifest: version 3
- Visibility: Public
- Publishing: Deferred publishing for the first release

Do not upload the source ZIP, a CRX file, the `dist` directory or a ZIP that
contains another ZIP.

## Store listing

- Language: English
- Category: Tools
- Homepage URL: `https://extension.scopuly.com/`
- Support URL: `https://extension.scopuly.com/support/`
- Official URL: `https://scopuly.com/`
- Privacy policy URL: `https://extension.scopuly.com/policy/`

The name and summary are read from `manifest.json`:

- Name: `Scopuly - Stellar Mobile Signer`
- Summary: `Connect Stellar dApps to Scopuly. Review account access and signing requests without exposing secret keys to the extension.`

Paste this detailed description:

```text
Scopuly Stellar Mobile Signer connects Stellar Network applications in your
desktop browser to the Scopuly wallet on your phone. It provides an explicit
Stellar signer connection for transactions, messages and Soroban requests.

Pair once with a QR code, choose which public account a site may use, and keep
final approval on mobile. The extension handles transaction signing and submit,
SEP-53 messages, Soroban authorization entries and Scopuly x402 receipts.
Scopuly Mobile independently reviews every sensitive operation.

Key properties:

- Final approval and signing happen in Scopuly Mobile.
- Secret keys and seed phrases never enter the browser extension.
- Returned transactions, messages and Soroban signatures are independently
  verified by the extension.
- Only the public key paired with the dApp is accepted as signer.
- Stellar Mainnet and Testnet are supported.
- dApp connections require explicit user approval.
- The extension contains no ads, analytics or remote executable code.

Scopuly Mobile is required. This extension does not create, import or recover
wallets. Encrypted provider requests and results are relayed through the
Scopuly Bridge only to deliver the requested wallet operation. The relay sees
short-lived routing metadata but cannot decrypt provider payloads.
```

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

Keep onboarding and rejection screenshots for reviewer documentation. Do not
upload them as the five public listing screenshots.

## Single purpose

Paste into the Privacy tab:

> Bridge Stellar dApps in the desktop browser to Scopuly Mobile for explicit
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

Select:

> No, I am not using remote code.

All executable JavaScript, HTML, CSS and fonts are bundled in the extension
package. Network responses contain data only.

## Data disclosures

Disclose the following categories conservatively because the extension handles
them locally and transmits them end-to-end encrypted to the paired signer:

- Personally identifiable information: public Stellar account addresses and
  user-assigned account or device labels.
- Financial and payment information: transaction XDR, transaction details,
  Soroban authorization entries and receipt identifiers.
- Authentication information: pairing/session identifiers and short-lived
  routing credentials.
- Personal communications: user-provided messages explicitly submitted for
  wallet signing.

Do not select health information, location, general web history, general user
activity or website content. The extension handles only the origin of a dApp
that explicitly invokes the provider; it does not monitor general browsing.

Certify all Limited Use statements. Data is not sold, used for advertising,
used for credit decisions or transferred for purposes unrelated to the
extension's single purpose.

## Reviewer test instructions

No Scopuly web account credentials are required. A compatible Scopuly Mobile
installation with one public Stellar account is required.

1. Install Scopuly Mobile:
   - iOS: `https://apps.apple.com/app/scopuly-stellar-defi-wallet/id1383402218`
   - Android: `https://play.google.com/store/apps/details?id=com.sdex.app`
2. Install the submitted Chrome extension and open its toolbar popup.
3. Select **Connect Scopuly Mobile** and scan the QR code in Scopuly Mobile.
4. Open `https://extension.scopuly.com/playground/`.
5. Select **Testnet** and request account access. Confirm that the extension
   displays the exact requesting origin before approval.
6. Use an existing mobile account and request a message signature or Testnet
   transaction signature. No funds are required when submission is disabled.
7. Reject one request, retry it, approve it on mobile and confirm the verified
   result returns only to the requesting playground page.
8. Disconnect the dApp in the extension and confirm that later provider
   requests require access again.

The extension does not create or import wallets and never asks the reviewer to
enter a secret key or seed phrase in the browser.

## Final pre-submit checks

- The privacy, support and homepage URLs return HTTP 200 without authentication.
- The mobile store version used by the reviewer supports extension pairing.
- The five screenshots were captured from the exact ZIP being submitted.
- The production bridge is reachable over HTTPS.
- The package SHA-256 matches `release/SHA256SUMS-v0.3.2.txt`.
- Deferred publishing is selected before submitting for review.
