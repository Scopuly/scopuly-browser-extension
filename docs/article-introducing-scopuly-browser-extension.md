# Introducing the Scopuly Browser Extension: Secure Stellar Signing Across Chrome, Edge and Firefox

> Publication status: draft. Publish after version `0.3.4` is approved in the
> Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons.

Stellar applications are increasingly capable, but a browser should not have to
become the place where a wallet secret lives. The Scopuly Browser Extension was
built to make Stellar dApps convenient to use while keeping final approval in
the Scopuly app that already controls the account.

Version `0.3.4` introduces the public name **Scopuly – Stellar Signer** and a
cross-platform pairing experience for Scopuly on iOS, Android and macOS.

## One clear signing boundary

The extension connects a Stellar dApp to a public account selected in Scopuly.
It does not create a browser wallet, import a seed phrase or store a secret key.
Each website must request access for its exact browser origin, and the user
chooses which public account that origin may see.

Sensitive requests follow one explicit path:

1. The dApp calls the typed `window.scopuly` provider.
2. The extension derives the trusted origin from the browser runtime and shows
   the request for review.
3. The request is encrypted for the paired Scopuly app and delivered through
   the Scopuly Bridge.
4. The user approves or rejects the operation in Scopuly.
5. The extension verifies the returned signer, transaction or signature before
   resolving the dApp request.

The Bridge sees the short-lived routing data needed to deliver an envelope, but
it cannot decrypt account metadata or signing payloads. Executable code is
bundled in the reviewed extension package rather than downloaded at runtime.

## Pair on mobile or Mac

On iOS and Android, pairing starts by scanning the short-lived QR code shown in
the extension. Scopuly for Mac can use the same encrypted flow by copying the
pairing link from the browser into the Mac app.

The protocol and extension recognize macOS as a signing-device platform. Mobile
background delivery continues to use notifications on iOS and Android. On Mac,
Scopuly receives requests while the app is open. This requires no additional
browser permission and does not change the public provider contract.

## Stellar methods, verified before return

The provider supports:

- explicit public-account access;
- Stellar transaction signing and optional submission;
- SEP-53 message signing;
- Soroban authorization entry signing;
- Scopuly x402 receipt reporting;
- Stellar Mainnet and Testnet.

For signed transactions, the extension checks that the transaction payload was
not changed unexpectedly and that the connected account added the expected
signature. Message and Soroban results have their own method-specific identity
checks. A rejection, cancellation, expiry or network mismatch remains a distinct
result that a dApp can handle safely.

## Available across major desktop browsers

Scopuly – Stellar Signer is distributed through official browser stores:

- [Chrome Web Store](https://chromewebstore.google.com/detail/scopuly-stellar-mobile-si/gfblddiiepicpjpffokeojikcphggmmd)
  for Chrome, Brave and Opera;
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/dgdmamodkdcafjehfelpcnifpldbfmai);
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/scopuly-stellar-signer/).

The Chromium, Edge and Firefox packages are built from the same public source.
Mozilla also receives a source archive that reproduces the submitted Firefox
package.

## Open for Stellar developers

Developers can use the zero-runtime-dependency
[`@scopuly/signer-extension-api`](https://www.npmjs.com/package/@scopuly/signer-extension-api)
package for provider discovery, TypeScript types and canonical error handling.
The [Developer Playground](https://extension.scopuly.com/playground/) exercises
account access, message signing, safe no-value transactions, Soroban requests,
rejection and disconnect against the installed extension.

The complete extension source, provider documentation and Bridge protocol
fixtures are available on
[GitHub](https://github.com/Scopuly/scopuly-browser-extension).

## What comes next

After the `0.3.4` browser-store rollout, Scopuly will propose a focused upstream
update to Stellar Wallets Kit so applications can select the browser extension
through the existing Scopuly integration. That work is intentionally separate
from this release: `0.3.4` does not require a new npm provider package or a
private Wallets Kit module.

The goal remains simple: explore Stellar applications in the browser, understand
what each dApp requests, and make the final decision in Scopuly.
