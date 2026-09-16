# Linkdid.ai

LinkedIn-profile discovery with free hold-to-fill gas, $1/L purchased gas, gas-based ranking, profiles/photos, account dashboard, payment history and support.

## Run and verify

Use Node.js 22 or newer.

```sh
npm ci
npm test
```

`npm run build` creates the current Sites/Cloudflare Worker package. `npm run build:vercel` creates CDN-ready static files in `public/` and the Node-compatible API module. Generated files are ignored; source and the lockfile belong in GitHub.

See [Vercel deployment](docs/VERCEL.md) for exact setup, environment variables and migration limitations. See [performance changes](docs/PERFORMANCE.md) for measured build facts and validation scope.

## Product rules

- Hold for 60 active seconds to earn 1 litre; release pauses, each litre requires a new gesture.
- Partial progress is saved by the server. Duplicate/replayed requests cannot award gas twice.
- Purchased gas costs $1/L. The server calculates the price; client-supplied amounts are ignored. Existing orders retain their original quoted price.
- Free gas drains at 1 L/hour; paid gas drains at 1 L/24 hours, independently and never below zero.
- Ranking uses remaining free + paid gas. Ties use profile creation time and ID.
- Merchant credentials, purchase terms and activation are required for real crypto checkout. LinkedIn OAuth photo import is not configured; manual uploads work with configured storage.

## Source layout

- `dist/*.js`, `dist/*.css`, `dist/*.webp`: existing application source and imagery.
- `server/`: shared application rules and Worker dispatcher.
- `portable/`, `api/handler.js`: Vercel adapters and email authentication.
- `scripts/`: optimized builds and repeatable database migrations.
- `drizzle/`: versioned SQLite schema migrations.
- `tests/`: gas, pricing, identity, runtime-adapter and bundle checks.

Do not commit credentials, generated deployments, customer data or `node_modules`. The `.openai/hosting.json` file identifies the existing private Sites deployment; Vercel does not use that file.
