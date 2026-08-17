# Microsoft Edge Add-ons Update Sheet

Use this sheet to update the existing Edge listing from `0.3.2` to `0.3.4`.

## Existing publication

- Extension ID: `dgdmamodkdcafjehfelpcnifpldbfmai`
- Public listing: `https://microsoftedge.microsoft.com/addons/detail/dgdmamodkdcafjehfelpcnifpldbfmai`
- Current public version before submission: `0.3.2`

## Package

- Upload: `release/scopuly-stellar-signer-edge-v0.3.4.zip`
- SHA-256: see `release/SHA256SUMS-v0.3.4.txt`
- Manifest: version 3
- Visibility: Public

The Edge archive must be byte-for-byte identical to the reviewed Chromium
archive. Do not add an `update_url` or Edge-specific branding.

## Store properties

- Name: `Scopuly – Stellar Signer`
- Language: English
- Category: Productivity / Tools
- Homepage: `https://extension.scopuly.com/`
- Support: `https://extension.scopuly.com/support/`
- Privacy policy: `https://extension.scopuly.com/policy/`
- Source: `https://github.com/Scopuly/scopuly-browser-extension`

Use the description, permission justifications and five public screenshots from
[`store-listing.md`](store-listing.md). Declare that the package contains no
remote executable code.

## Reviewer notes

No web account credentials are required. Pair Scopuly by scanning the QR code
on iOS/Android, or by copying the pairing link into Scopuly for Mac. Use the
Testnet playground at `https://extension.scopuly.com/playground/` so no funds
are required.

## Before submission

- Install and test the exact ZIP in Microsoft Edge.
- Complete pairing, account access, rejection and Testnet signing checks.
- Confirm the popup and confirmation window at desktop and narrow widths.
- Confirm the privacy, support and playground URLs return HTTP 200.
- Confirm the Edge and Chromium archive hashes are identical.
- Confirm the package hash is recorded in `release/SHA256SUMS-v0.3.4.txt`.
