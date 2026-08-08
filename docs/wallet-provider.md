# Scopuly Provider API

The extension injects `window.scopuly` into HTTP(S) top-level pages. The
extension derives the effective origin from the browser runtime and ignores any
origin claimed by page JavaScript.

The extension provider contract version is `0.3.0`. The provider identifies
itself with:

```js
window.scopuly.__scopulyProviderVersion === '0.3.0';
window.scopuly.isScopuly === true;
window.scopuly.platform === 'extension';
```

TypeScript dApps can install
[`@scopuly/signer-extension-api`](https://www.npmjs.com/package/@scopuly/signer-extension-api)
to use the canonical provider types and delegate functions without duplicating
the `window.scopuly` interface.

An executable open-source integration is available in
[`examples/developer-playground/`](../examples/developer-playground/). Its
separate build defaults to Mainnet and provides an explicit Public/Testnet
selector, message-signing and no-value transaction scenarios without becoming
part of the extension runtime. Signing requires the same network to be selected
in the extension.
The example imports the published API package and exercises the same provider
surface exposed to third-party dApps. Try the hosted version at
[`https://playground.scopuly.com/`](https://playground.scopuly.com/).

It also publishes the optional `window.stellar.scopuly` discovery namespace.

The provider is also available through the zero-dependency Stellar Wallets Kit
2.5 adapter in
`integrations/stellar-wallets-kit/scopuly-extension.module.mjs`. Scopuly does
not publish a `window.freighterApi` alias because wallet identity must remain
explicit.

## Connection

### `requestAccess()` / `getAddress()`

Requests access to one public address available through the paired signer.

```js
const { address } = await window.scopuly.requestAccess();
```

The browser confirmation binds the exact dApp origin to the selected account.
The dApp never receives other paired accounts.

`connect()` remains as a legacy alias for `requestAccess()`.

### `getPublicKey()`

Returns the connected public key as a string:

```js
const publicKey = await window.scopuly.getPublicKey();
```

### `isConnected()`

```js
const { isConnected } = await window.scopuly.isConnected();
```

### `disconnect()`

Removes only the permission for the requesting dApp origin.

```js
await window.scopuly.disconnect();
```

## Network

### `getNetwork()`

```js
const { network, networkPassphrase } = await window.scopuly.getNetwork();
```

`network` is `PUBLIC` or `TESTNET`. The passphrase is the authoritative value
used when parsing and signing the transaction.

## Signing

### `signTransaction(xdr, options)`

Sends a transaction through the configured extension transport and resolves
only after the returned signature and unchanged transaction hash have been
verified.

```js
const { signedTxXdr, signerAddress, hash } =
  await window.scopuly.signTransaction(xdr, {
    address,
    networkPassphrase
  });
```

Supported networks are Stellar Mainnet and Testnet. Requests expire after five
minutes. Rejection, expiry, signer mismatch, payload changes and malformed XDR
reject the promise. Retryable bridge outages remain pending with bounded
backoff until the request expires.

### `signAndSubmitTransaction(xdr, options)`

The paired signer signs and submits through its configured network endpoint.
Custom submit URLs are rejected.

```js
const { signedTxXdr, signerAddress, status, hash } =
  await window.scopuly.signAndSubmitTransaction(xdr, {
    address,
    networkPassphrase
  });
```

`signTransaction(xdr, { submit: true })` uses the same signing flow while
preserving the original provider method in its result.

### `signMessage(message, options)`

Signs the SEP-53 domain-separated message after user approval. The extension
verifies the returned Ed25519 signature before resolving.

```js
const { signedMessage, signerAddress } =
  await window.scopuly.signMessage('Approve order #42', {
    address,
    networkPassphrase
  });
```

`signedMessage` is a lowercase 128-character hex string.

### `signAuthEntry(authEntry, options)`

Reviews and signs a Soroban authorization preimage. The extension verifies its
network, fingerprint, address-bound signer and returned signature.

```js
const { signedAuthEntry, signerAddress } =
  await window.scopuly.signAuthEntry(authEntryXdr, {
    address,
    networkPassphrase
  });
```

`signedAuthEntry` is the raw 64-byte signature encoded as padded base64.

### `reportX402Receipt(receipt)`

Asks the paired signer to load and attach a canonical Scopuly x402 receipt to
its reserved payment.

```js
const result = await window.scopuly.reportX402Receipt({
  receiptId: '090eba2a51a51f4b1be18f5141aacd9f'
});
```

Only the exact
`https://api.scopuly.com/x402/receipt/<32-lowercase-hex>` endpoint is accepted.
The method returns `{ receiptId, status, transaction? }`. It does not create a
new signature.

All five methods are present in extension transport protocol 1.0. The
extension rejects a method that is not available in the negotiated pairing
capabilities.

## Events

The page receives `scopuly#initialized` when the provider is ready.

Use `onChange()` or the `scopuly#change` DOM event to observe origin permission,
selected account and network changes:

```js
const removeListener = window.scopuly.onChange((event) => {
  console.log(event.address, event.network, event.isConnected, event.changed);
});

removeListener();
```

## Errors

Provider calls reject with `{ code, message }`:

- `-1` — internal error;
- `-2` — bridge or external-service error;
- `-3` — invalid or unsupported request;
- `-4` — user rejection.

These codes are stable within extension provider contract `0.3.0`.
