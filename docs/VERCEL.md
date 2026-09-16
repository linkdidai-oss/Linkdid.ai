# Deploy Linkdid on Vercel

The Vercel build serves the frontend through Vercel's CDN and the API through a Node.js Function. It uses Turso/libSQL for the existing SQLite schema and Supabase for verified email sign-in and private photo storage. It does not proxy the private ChatGPT Site or trust its identity headers on Vercel.

## 1. Create the backing services

1. Create a Turso database and database token. Keep both server-side.
2. Create a Supabase project. Enable Email authentication.
3. In Supabase Authentication → Email Templates → Magic Link, include the OTP code: `Your Linkdid sign-in code is {{ .Token }}`. The interface accepts this code; it is not configured as a magic-link callback.
4. Configure production email delivery/SMTP in Supabase and verify it with your own address before inviting users. The development email service has restrictions.
5. Create a **private** Supabase Storage bucket named `profile-photos`, restricted to PNG/JPEG/WebP and 2 MB files. The server uses the service-role key to upload/read files; the frontend never receives this key. Public profile-photo requests are served through `/photos/:id`.

## 2. Configure Vercel

Import the GitHub repository. Framework preset: **Other**. Node.js: **22.x or newer**. Root directory: repository root. The committed `vercel.json` sets the build command and output directory.

Set these Environment Variables for the intended Production/Preview environments:

| Variable | Purpose |
|---|---|
| `TURSO_DATABASE_URL` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Secret database token |
| `SUPABASE_URL` | Supabase project URL; also used at build time |
| `SUPABASE_PUBLISHABLE_KEY` | Public anon/publishable key; also used at build time |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret server-only service role key |
| `SUPABASE_PHOTO_BUCKET` | `profile-photos` |
| `ADMIN_USER_ID` | Optional `supabase:<your verified user UUID>` |
| `CRYPTO_PAYMENTS_ENABLED` | Keep `false` until merchant setup and transaction verification |
| `NOWPAYMENTS_API_KEY` | Optional merchant secret |
| `PURCHASE_TERMS_URL` | HTTPS purchase/refund terms URL for checkout activation |

The example names are also in `.env.example`. Never put secret values into GitHub. Changes to the public Supabase URL/key require a new build.

## 3. Apply schema migrations

From a trusted shell with the Turso variables exported, run:

```sh
npm run db:migrate:vercel
```

This applies the versioned migrations once, recording each in `linkdid_migrations`. Each migration is transactional. Do not point this command at a database already initialized independently without reconciling its migration history first.

## 4. Deploy and verify

Deploy from Vercel. Confirm `/`, `/claim`, `/signin`, `/account` and deep links work. Sign in using a real emailed OTP; save a profile; upload a photo; hold the pump, release early and resume; verify the saved balance after reload. Test a second account for isolation. Confirm sound/mute and narrow-screen layouts on your actual devices.

Real email delivery, hosted database connectivity, storage credentials, merchant payments and Vercel routing require verification in your configured deployment. Local tests use SQLite and mocked identity verification; they do not establish that your external services are configured correctly.

## Existing Site data

The current Sites database, profile-photo bucket and ChatGPT login accounts are not automatically exported or migrated. The new Turso database starts empty. Moving existing customer data requires an authorized data export, copying the photos, and an explicit mapping from the old owner IDs to verified Supabase user IDs. Do not automatically reassign profiles from unverified emails or LinkedIn URLs. Keep the existing Site available until that migration is reviewed and tested.

## Provider documentation

- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Turso JavaScript client and atomic batches](https://docs.turso.tech/sdk/ts/reference)
- [Supabase email OTP setup](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase verified user lookup](https://supabase.com/docs/reference/javascript/auth-getuser)

## Configuration compatibility and independent sign-in

The app also accepts `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The server-only photo-storage credential may be named `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. `/api/auth-config` returns only a validated public URL/key; secret keys are never serialized, even if a public variable is misconfigured. The browser retries runtime configuration when the build had no public Supabase configuration.

Sign-in and anonymous `/api/me` no longer require Turso or photo-storage credentials. Signed-out account visitors are directed to sign-in before requesting database-backed dashboard data. The APIs still verify access tokens and enforce ownership independently of this browser redirect. Missing Turso configuration still prevents leaderboard/profile/gas persistence: configure the Turso database and apply migrations, or perform a separately validated Postgres port before replacing that database. A Supabase Postgres connection URL is not compatible with the existing libSQL adapter.
