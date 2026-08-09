# Chrome Web Store Listing

## Name

Scopuly - Stellar Mobile Signer

## Short description

Connect Stellar dApps to Scopuly. Review account access and signing requests without exposing secret keys to the extension.

## Detailed description

Scopuly Stellar Mobile Signer connects Stellar Network applications in your
desktop browser to the Scopuly wallet on your phone. It provides an explicit
Stellar signer connection for transactions, messages and Soroban requests.

Pair once with a QR code, choose which public account a site may use, and keep
final approval on mobile. The extension handles transaction signing and submit,
SEP-53 messages, Soroban authorization entries and Scopuly x402 receipts.
Scopuly Mobile independently reviews every sensitive operation.

Key properties:

- final approval and signing happen in Scopuly Mobile;
- secret keys and seed phrases never enter the browser extension;
- returned transactions, messages and Soroban signatures are independently
  verified by the extension;
- only the public key paired with the dApp is accepted as signer;
- Stellar Mainnet and Testnet support;
- explicit dApp connection management;
- no ads, analytics, sale of data or remote executable code.

Scopuly Mobile is required. This extension does not create, import or recover wallets.

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

## Single purpose

Bridge Stellar dApps in the desktop browser to Scopuly Mobile for explicit
account access, signing, transaction submission and verified result delivery.

## Required disclosures

- Dependency: a compatible Scopuly Mobile app and network connection are required.
- Data transmission: encrypted provider requests and results are relayed through
  the Scopuly Bridge solely to deliver the requested wallet operation. The
  relay receives routing metadata but cannot decrypt application payloads.
- No local wallet: the extension cannot sign without the paired mobile app.

## Search terms

Scopuly, Stellar, XLM, mobile wallet, transaction signer, dApp wallet.

Avoid unsupported claims such as “most secure”, “audited” or “non-custodial”
until the published extension release has evidence for them.

## Chrome screenshot upload order

Chrome accepts no more than five screenshots. Upload only these final captures
from the exact release ZIP:

1. connected control center;
2. encrypted mobile pairing;
3. explicit dApp account access;
4. transaction waiting for mobile review;
5. verified transaction result.

Keep onboarding and rejection captures for reviewer notes, support and other
stores. Never upload the AI moodboard or a screen that is not present in the
release package.

Generate reviewer assets only from the final versioned Chromium ZIP and a
controlled HTTPS reviewer origin:

```sh
SCOPULY_REVIEWER_URL=https://extension.scopuly.com/playground/ npm run smoke:chromium:reviewer-assets
```

The capture command refuses localhost and non-HTTPS origins. Regenerate the
files after any release ZIP change; previews from an unversioned candidate ZIP
must not be uploaded.
