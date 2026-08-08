# Scopuly module for Stellar Wallets Kit

This zero-runtime-dependency adapter implements the module surface used by
`@creit.tech/stellar-wallets-kit` 2.5.x.

```js
import {StellarWalletsKit} from '@creit.tech/stellar-wallets-kit/sdk';
import {defaultModules} from '@creit.tech/stellar-wallets-kit/modules/utils';
import {
  ScopulyExtensionModule,
} from '@scopuly/stellar-wallets-kit-module';

StellarWalletsKit.init({
  modules: [
    ...defaultModules(),
    new ScopulyExtensionModule(),
  ],
});
```

The adapter talks only to `window.scopuly`. It does not impersonate Freighter
or install a `window.freighterApi` alias. `getAddress`,
`signTransaction`, `signAndSubmitTransaction`, `signMessage`,
`signAuthEntry`, `getNetwork` and `disconnect` map directly to the Scopuly
provider. `reportX402Receipt` is also available as a Scopuly-specific extension.

Keep this package private until its API package, store URL and product icon have
stable public locations. Then submit the module upstream to Stellar Wallets Kit
for inclusion in its default wallet list.
