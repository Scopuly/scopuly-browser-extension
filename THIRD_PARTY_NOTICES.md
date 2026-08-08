# Third-party notices

Scopuly Extension bundles or builds with open-source packages. The authoritative
license texts and copyright notices are included in each installed package.

Direct runtime dependencies:

- `Baloo 2` font files — SIL Open Font License 1.1
- `@stellar/stellar-sdk` — Apache License 2.0
- `lucide` — ISC License
- `qrcode` — MIT License

Direct development dependencies:

- `@types/chrome`, `@types/node`, `@types/qrcode` — MIT License
- `archiver` — MIT License
- `playwright-core` — Apache License 2.0
- `typescript` — Apache License 2.0
- `vite`, `vitest` — MIT License
- `web-ext` — Mozilla Public License 2.0

Optional integration peer dependencies, not bundled in the extension:

- `@creit.tech/stellar-wallets-kit` — MIT License

Transitive packages also use permissive MIT, Apache-2.0, BSD-3-Clause, ISC and
BlueOak-1.0.0 licenses. Release preparation must regenerate and review the
dependency inventory from `package-lock.json`.
