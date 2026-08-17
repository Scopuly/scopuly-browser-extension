# Browser Extension Publication Checklist

This checklist covers only the Scopuly browser extension and its public source
repository.

## Public repository

- [x] Repository metadata points to `Scopuly/scopuly-browser-extension`.
- [x] MIT license, trademark notice and third-party notices are present.
- [x] README, provider API, privacy, security, support and contribution files
  describe the extension.
- [x] Signing keys, credentials, generated builds and private review files are
  excluded from Git and source archives.
- [x] GitHub issue templates, pull-request template, CODEOWNERS, CI and
  Dependabot configuration are present.
- [x] Initial public commit is published after owner approval.

## Extension behavior

- [x] `window.scopuly` is injected at `document_start` in the MAIN world.
- [x] MAIN and ISOLATED content scripts remain separate.
- [x] Trusted dApp origins come from the browser runtime, not page input.
- [x] Account access is explicitly approved per origin.
- [x] Pending requests persist across Manifest V3 worker restarts and expire.
- [x] Transaction, message and Soroban authorization results are verified
  before they are returned to a dApp.
- [x] Secret keys and seed phrases never enter extension storage or UI.
- [x] Pairing supports QR scanning on iOS/Android and pairing-link entry on
  macOS.
- [x] `macos` signing devices are accepted by runtime validation and the public
  Bridge schema.
- [x] The manifest requests only `storage` plus the required page and Scopuly
  service origins.

## Build and packaging

- [x] Package and manifest versions match at `0.3.4` for the next store update.
- [x] Chromium production build passes local validation.
- [x] Current Chromium archive passes exact-ZIP smoke and the complete mocked
  reviewer pairing/signing flow.
- [x] Source ZIP reproduces the Firefox release archive exactly.
- [x] Binary packages include `LICENSE`, `THIRD_PARTY_NOTICES.md` and `OFL.txt`.
- [x] Version `0.3.4` archives pass Chromium, Edge and Firefox exact-ZIP smoke
  checks; Firefox lint reports zero errors, warnings and notices.
- [x] Chromium and Edge `0.3.4` archives are byte-for-byte identical.
- [ ] Publish version `0.3.4` updates in Chrome, Edge and Firefox stores.
- [x] Publish Chromium version `0.3.2` from the approved commit.
- [x] Generate the final Chromium, Edge, Firefox and source `0.3.4` archives.
- [x] Install and test the Firefox archive in Firefox; run exact-archive smoke
  against the Edge package.
- [x] Record SHA-256 checksums for all four `0.3.4` archives.
- [ ] Complete the final target-browser check in Microsoft Edge.
- [ ] Pair the exact `0.3.4` build with installed Scopuly for Mac `2.6.18` and
  complete account access, Testnet signing, rejection and app-restart checks.
- [x] Firefox `0.3.2` passes `web-ext lint`, exact-package Firefox smoke and
  clean source reproduction.
- [x] Edge `0.3.2` is byte-for-byte identical to the reviewed Chromium archive.
- [x] Run the exact Edge archive in Microsoft Edge.

## Security and privacy

- [x] Extension CSP blocks remote executable code, inline scripts and `eval`.
- [x] Secret and private-key filename guards run during validation.
- [x] Provider payloads have method-specific validation and size limits.
- [x] Final extension privacy policy and security reporting instructions are
  included in the repository.
- [x] Publish final privacy and support URLs for store listings.
- [x] Extension-specific privacy, support and homepage pages are published at
  `extension.scopuly.com`.
- [ ] Enable GitHub secret scanning, push protection and private vulnerability
  reporting.
- [ ] Complete an independent browser-extension security review.

## Store listing

- [x] Chrome Web Store version `0.3.2` is public at extension ID
  `gfblddiiepicpjpffokeojikcphggmmd`.
- [ ] Replace the Chrome Web Store privacy-policy URL with
  `https://extension.scopuly.com/policy/` in the developer dashboard.
- [x] Publish the dedicated Firefox Add-ons listing at
  `https://addons.mozilla.org/en-US/firefox/addon/scopuly-stellar-signer/`.
- [x] Publish the dedicated Microsoft Edge Add-ons listing at
  `https://microsoftedge.microsoft.com/addons/detail/dgdmamodkdcafjehfelpcnifpldbfmai`.
- [x] Store name, descriptions, permission justifications and search terms are
  drafted in [`store-listing.md`](store-listing.md).
- [x] The `0.3.4` name and listing copy describe Scopuly on iOS, Android and
  macOS without changing permission or privacy declarations.
- [x] A separate canonical launch-article draft is ready for publication after
  all three stores approve `0.3.4`.
- [x] Required image dimensions and duplicate-image checks are automated.
- [x] Recapture all store screenshots from the exact final Chromium archive.
- [x] Confirm the listing contains no unsupported security or audit claims.
- [x] Confirm privacy disclosures match the final extension behavior.
- [ ] Deploy the updated cross-platform copy to `extension.scopuly.com` and
  `scopuly.com`.

## Permission justifications

`storage`: persists paired public accounts, settings, dApp permissions and
pending requests across browser and worker restarts.

`<all_urls>` content-script match: makes `window.scopuly` discoverable on dApps.
The content scripts do not read general page content, cookies or browsing
history; they relay only explicit provider requests.

`https://api.scopuly.com/*`: sends pairing and provider envelopes through the
configured Scopuly transport.

## Reviewer path

1. Install the final browser archive.
2. Open the extension and pair a compatible Scopuly signer.
3. Open the supplied HTTPS developer playground.
4. Request account access and confirm the extension displays the exact origin.
5. Approve one public account.
6. Request a safe Testnet transaction or message signature.
7. Confirm the extension shows the request and pending state without a local
   signing action.
8. Reject once, retry, approve and verify the result reaches only the requesting
   origin.
9. Disconnect the dApp and confirm subsequent provider requests fail.

## Build commands

```bash
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run package:chromium
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run package:edge
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run package:firefox
npm run package:source
```
