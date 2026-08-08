# Security Policy

Scopuly Extension connects Stellar dApps to a paired signer. Secret keys and
seed phrases must never enter the extension, dApp, logs, analytics or support
tooling.

## Implemented browser protections

- The dApp origin is derived from `chrome.runtime.MessageSender`, not page input.
- Only HTTP(S) origins are accepted; remote HTTP is blocked by default.
- dApp names are length-limited and stripped of control characters.
- dApp icons must be same-origin, limited to small raster images, and are stored
  as local snapshots for extension UI rendering.
- The manifest uses only the `storage` extension permission.
- Remote code, inline scripts and `eval` are blocked by the extension CSP.
- Pending requests persist across Manifest V3 worker restarts and expire after five minutes.
- Unconsumed terminal provider payloads are removed after fifteen minutes.
- XDR input is parsed before forwarding and has a size limit.
- Message, Soroban authorization and x402 receipt inputs are independently
  normalized, reviewed and bounded.
- Mainnet and Testnet are the only accepted network passphrases.
- A signer response is accepted only if the transaction hash is unchanged,
  every existing signature is preserved and exactly one new signature verifies
  against the expected public key.
- Pairing account metadata and provider payloads use P-256 ECDH,
  HKDF-SHA-256 and AES-256-GCM with context-bound AAD.
- Pairing is authenticated by an Ed25519 proof from every shared Stellar
  account; channel counters are persisted and strictly monotonic.
- Relay access tokens never leave the background runtime state boundary.
- The extension session private keys are non-extractable P-256
  `CryptoKey` objects. The extension key is persisted in background IndexedDB;
  ordinary extension storage contains only its random key reference.
- Network/429/5xx failures retry with bounded backoff until request expiry.
- UI strings are rendered with DOM text nodes rather than interpolated HTML.

## Release blockers

- Validate the final release archives in every supported browser.
- Complete end-to-end signing checks with a production-compatible paired signer.
- Confirm the published privacy, support and vulnerability-reporting URLs.
- Complete an independent browser-extension security assessment.

## Reporting

Do not open public issues for an exploitable vulnerability. Use **Report a
vulnerability** in the repository Security tab, which sends a private GitHub
Security Advisory to the maintainers. If that option is unavailable, contact a
Scopuly maintainer privately and disclose only enough information to establish
a secure reporting channel.
