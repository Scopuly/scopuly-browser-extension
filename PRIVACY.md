# Scopuly Browser Extension Privacy Policy

Effective date: August 9, 2026

Last updated: August 9, 2026

## Scope

This policy applies only to the Scopuly browser extension. It does not replace
privacy notices for other Scopuly products or third-party Stellar dApps.

## Data handled by the extension

The extension handles only data needed to connect a Stellar dApp in the
browser to a Scopuly signer selected by the user:

- the origin and user-facing name of a dApp that explicitly calls the Scopuly
  provider;
- public Stellar addresses and user-assigned account or device labels shared
  during pairing;
- the selected Stellar network, transaction XDR and hash, messages, Soroban
  authorization entries, Scopuly x402 receipt identifiers and approval status;
- pairing and session identifiers, extension version, request timestamps,
  expiration values and short-lived routing credentials;
- local settings, dApp approvals, security preferences and pending request
  state.

The extension does not request, collect or store Stellar secret keys, seed
phrases, wallet passwords or biometric data. It does not read general page
content, cookies, form data or browsing history.

## How data is used

Data is used only to provide the extension's single purpose: pairing the
browser with a paired Scopuly app, sharing a user-approved public account with a dApp,
delivering explicit wallet requests, returning verified results and maintaining
the security and reliability of that flow.

The extension has no advertising or analytics SDK. Scopuly does not sell data,
use it for advertising, credit decisions or unrelated profiling, or combine it
with data from unrelated products for marketing.

## Transmission and disclosure

Pairing and provider data is transmitted through the configured Scopuly Bridge
only to deliver it to the paired signer. Public account metadata, dApp origins,
messages, transaction XDR, Soroban authorization entries and results are
end-to-end encrypted between the extension and the paired signer. The relay
receives short-lived routing identifiers, expiry values, counters and
ciphertext, but cannot decrypt provider payloads.

When the user explicitly requests transaction submission, the approved signed
transaction may be sent to the public Stellar network. Public blockchain data
is visible according to the rules of the Stellar network.

Scopuly does not disclose extension data to third parties except when necessary
to provide the requested extension function, protect the service or users,
comply with law, or complete a business transfer subject to this policy.

## Local storage and security

Public accounts, paired-session metadata, user settings, dApp approvals and
pending requests are stored in the browser extension's isolated local storage.
The non-extractable channel private key is stored as a `CryptoKey` in background
IndexedDB; ordinary extension state contains only a random reference to it.
Channel keys and relay credentials are never returned to extension UI pages.

The extension limits browser permissions, blocks remote executable code,
authenticates pairing with a Stellar account signature, uses authenticated
encryption and verifies method-specific signer results before returning them to
a dApp.

## Retention and deletion

Pending requests expire after five minutes. Unconsumed terminal results are
removed from local storage after fifteen minutes. Pairing channel material is
deleted on cancellation, error or expiry. Session material is deleted on local
disconnect or session expiry.

Users can remove an individual dApp approval or disconnect a paired session in
the extension. Uninstalling the extension removes its browser-local data. For a
privacy request concerning Scopuly-operated services, contact
[info@scopuly.com](mailto:info@scopuly.com).

## Chrome Web Store Limited Use disclosure

The Scopuly browser extension's use and transfer of information received from
Google APIs and browser permissions complies with the Chrome Web Store User
Data Policy, including its Limited Use requirements:

- information is used only to provide or improve the extension's user-facing
  signing and account-access functionality;
- information is transferred only when necessary to provide that functionality,
  for security, to comply with law, or as part of a business transfer;
- information is never used for personalized, retargeted or interest-based
  advertising;
- humans are not permitted to read encrypted provider payloads, except data the
  user voluntarily supplies for support, when necessary for security or legal
  compliance, or when aggregated and anonymized for internal operations.

## Changes

Material changes will be published at
[https://extension.scopuly.com/policy/](https://extension.scopuly.com/policy/)
with an updated revision date. If a change requires additional consent, the
extension will request it before the new processing begins.

## Contact

Privacy and support questions may be sent to
[info@scopuly.com](mailto:info@scopuly.com). Security vulnerabilities must be
reported through the private process described in
[SECURITY.md](SECURITY.md).
