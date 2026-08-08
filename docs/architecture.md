# Extension Architecture

## Scope

Scopuly Browser Extension is a browser-side provider and request-review layer.
It does not contain a Stellar secret key, seed phrase or local transaction
signer.

## Browser components

| Component | Responsibility | Security boundary |
| --- | --- | --- |
| MAIN-world provider | Expose `window.scopuly` and correlate dApp responses | Cannot access extension APIs or choose the trusted page origin |
| Isolated content script | Relay typed messages across the page boundary | Does not interpret or modify signing payloads |
| Background runtime | Derive the trusted origin, enforce policy, persist requests and verify results | Never stores a Stellar secret key or seed phrase |
| Confirmation UI | Display origin, account, network, operations, warnings and request status | Cannot sign or silently approve a request |
| Options UI | Manage pairing, dApp permissions, network and security preferences | Receives only UI-safe state from the background runtime |

## Request flow

1. A dApp calls `window.scopuly.requestAccess()` or another supported provider
   method.
2. The MAIN-world provider forwards only the method and allowed fields to the
   isolated content script.
3. The background runtime derives the trusted origin from the browser message
   sender rather than page-supplied data.
4. Account access opens a local confirmation bound to that exact origin.
5. Signing requests are parsed, assigned a persistent request ID, encrypted and
   sent through the configured transport to the paired signer.
6. Request state survives a Manifest V3 worker restart and expires after five
   minutes.
7. The extension validates the returned transaction, signature, authorization
   entry or receipt against the original request and paired public account.
8. Only a valid result is returned to the requesting origin.

## State and key handling

`chrome.storage.local` stores public accounts, pairing metadata, origin
permissions, settings and pending request state. The extension's
non-extractable P-256 session private key is stored as a `CryptoKey` in
background IndexedDB; normal extension state contains only a random key
reference.

Session keys and transport credentials are never returned to popup, options or
confirmation pages. Terminal provider responses are removed after consumption
or expiry. The extension does not store seed phrases, Stellar secret keys,
cookies, browsing history or analytics identifiers.

## Page isolation

The provider is installed through a manifest `world: "MAIN"` content script at
`document_start`. It is not exposed as a web-accessible JavaScript resource.
The relay content script runs separately in `world: "ISOLATED"` and is the only
page-facing component with access to `chrome.runtime`.

## Transport boundary

The `MobileSignerTransport` interface keeps network delivery separate from
provider handling and UI state. The current adapter uses authenticated,
end-to-end encrypted request envelopes with persistent monotonic counters and
bounded retry. The extension treats every transport response as untrusted
until method-specific verification succeeds.

## Browser targets

- Chrome, Brave, Opera and Edge use the Chromium Manifest V3 package.
- Firefox uses the same provider and isolation boundary with a target-specific
  event-page manifest.
- Safari requires a separately signed Safari Web Extension wrapper and is not
  included in the current release tooling.
