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
- [x] The manifest requests only `storage` plus the required page and Scopuly
  service origins.

## Build and packaging

- [x] Package and manifest versions match at `0.3.2`.
- [x] Chromium production build passes local validation.
- [x] Current Chromium archive passes exact-ZIP smoke and the complete mocked
  reviewer pairing/signing flow.
- [x] Source ZIP reproduces the public Git file set.
- [x] Binary packages include `LICENSE`, `THIRD_PARTY_NOTICES.md` and `OFL.txt`.
- [ ] Regenerate the final Chromium, Edge and Firefox archives from the
  approved commit.
- [ ] Install and test each final archive in its target browser.
- [ ] Record SHA-256 checksums for the final archives.
- [x] Record and verify the SHA-256 checksum for the current Chromium archive.
- [ ] Run equivalent final archive checks when preparing Edge and Firefox.

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

- [x] Store name, descriptions, permission justifications and search terms are
  drafted in [`store-listing.md`](store-listing.md).
- [x] Required image dimensions and duplicate-image checks are automated.
- [x] Recapture all store screenshots from the exact final Chromium archive.
- [x] Confirm the listing contains no unsupported security or audit claims.
- [x] Confirm privacy disclosures match the final extension behavior.

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
