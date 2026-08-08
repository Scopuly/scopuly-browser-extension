# Contributing

Scopuly Browser Extension is a Manifest V3 provider for Stellar dApps.

## Development setup

Use Node.js 22 or newer.

```bash
npm ci
npm run check
npm test
```

For a production-equivalent Chromium build:

```bash
VITE_SCOPULY_BRIDGE_URL=https://api.scopuly.com/extension-bridge npm run build:chromium
```

Do not include generated `dist/`, `release/` or `node_modules/` content in a
pull request.

## Pull requests

- Keep changes focused and explain their security impact.
- Add or update tests for provider, bridge and transaction-review behavior.
- Preserve the MAIN/ISOLATED content-script boundary and minimal permissions.
- Use English for source comments, documentation and UI copy.
- Confirm `npm run check` and `npm test` pass before requesting review.

Please keep contributions focused on:

- signer safety;
- readable transaction review;
- dApp compatibility;
- minimal permissions;
- accessible UI;
- clear Scopuly branding without leaking secret material.

Do not add remote code loading, analytics trackers, or hidden network side effects.

## Security reports

Do not disclose exploitable vulnerabilities in issues or pull requests. Follow
the private reporting process in [SECURITY.md](SECURITY.md).
