# Scopuly Provider Playground

This page is a provider integration example and manual test surface for the
Scopuly browser extension. It is a separate Vite build and is never included
in the extension package. It imports the published
`@scopuly/signer-extension-api` package for the canonical provider types and
runtime access helper.

Production demo: [`https://extension.scopuly.com/playground/`](https://extension.scopuly.com/playground/)

This directory is the canonical minimal source reference for the same public
provider flow. The production page uses a separate presentation layer.

## Run locally

From the extension repository root:

```bash
npm install
npm run playground:dev
```

Open `http://localhost:5177` in a Chromium browser with the unpacked Scopuly
extension installed. Port `5177` is fixed with strict-port mode. Remote
deployments must use HTTPS. Localhost is the only plain-HTTP origin allowed by
the extension's default security policy.

## Mainnet-default flow

1. Pair a Scopuly signer. Select **Public** or **Testnet** in the playground and
   select the same network in the extension. The page never changes extension
   settings without the user.
2. Click **Request access** and approve the public account in the extension.
3. Click **Sign message** and verify the pending, approval and completed states.
4. Click **Build safe XDR**. The playground reads only the public account
   sequence from Horizon for the selected network and creates a no-value
   `manageData` operation.
5. Click **Sign only**, reject once, then approve a fresh request.
6. Restart the browser and repeat the message and transaction tests to verify
   extension request persistence.

The page has no secret-key input and never needs a seed phrase. **Sign and
submit** is separately gated because it changes the account's
`scopuly-playground` data entry. On Mainnet it consumes a real XLM fee; use
**Sign only** unless an actual ledger submission is intentional.

## Build for HTTPS hosting

```bash
npm run playground:build
```

Upload the generated `playground-dist/` directory to a dedicated HTTPS origin.
Do not add production API credentials, wallet secrets or analytics that record
provider results. The extension derives the dApp identity from the actual page
origin, not from fields supplied by this page.

## Minimal integration

```js
import {
  getNetwork,
  requestAccess,
  signTransaction
} from '@scopuly/signer-extension-api';

const { address } = await requestAccess();
const { networkPassphrase } = await getNetwork();

const signed = await signTransaction(transactionXdr, {
  address,
  networkPassphrase
});
```

See [`../../docs/wallet-provider.md`](../../docs/wallet-provider.md) for the
complete provider contract and error codes.
