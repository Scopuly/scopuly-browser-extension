# Scopuly Browser Extension Privacy Notice

Status: release draft. The public version and effective date must be approved
against the final extension behavior before store submission.

## Scope

This notice covers the Scopuly browser extension.

## Data used by the extension

To provide pairing and request approval, the extension processes:

- the origin and user-facing name of a dApp that explicitly calls the Scopuly provider;
- public Stellar addresses and user-assigned account or device labels shared
  during pairing;
- network, transaction XDR and hash, messages, Soroban authorization entries,
  canonical Scopuly x402 receipt identifiers and approval status;
- pairing/session identifiers, extension version, request timestamps and expiration;
- local settings, dApp approvals and security policies.

The extension does not request or process a seed phrase or Stellar secret key. It does not read general page content, cookies or browsing history.

## Transmission

Pairing and provider data is transmitted through the configured Scopuly relay
only to deliver it to the paired signer. Account metadata, dApp origins,
messages, XDR, authorization entries and results are end-to-end encrypted. The
extension sends short-lived routing identifiers, expiry, counters and
ciphertext; it does not send wallet secret keys or seed phrases.

The extension does not sell data, use it for advertising, credit decisions or unrelated profiling, and contains no third-party analytics SDK.

## Local storage

Public accounts, paired-session metadata, user settings, dApp approvals and
pending requests are stored in the browser extension’s isolated local storage.
The non-extractable channel private key is stored as a `CryptoKey` in background
IndexedDB; ordinary extension state contains only a random reference to it.
Channel keys and relay tokens are never returned to extension UI pages. Users
can remove dApp approvals and disconnect paired sessions from the extension.

## Retention

Pending requests expire after five minutes. Unconsumed terminal results are
removed from local storage after fifteen minutes. Pairing channel material is
deleted on cancellation, error or expiry; session material is deleted on local
disconnect or session expiry.

The extension does not write provider payloads, authorization headers, pairing
links or response bodies to analytics or application logs.

## Security

The extension limits browser permissions, blocks remote executable code,
authenticates pairing with a Stellar account signature, uses end-to-end
authenticated encryption and verifies method-specific signer results before
returning them to a dApp.

## Contact

Privacy and support questions may be sent to [info@scopuly.com](mailto:info@scopuly.com).
Security vulnerabilities must use the private process in [SECURITY.md](SECURITY.md).
