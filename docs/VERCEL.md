# Vercel frontend with Supabase backend

Production uses Vercel for static assets and a same-origin API gateway. All application database queries, verified authentication and private photo storage run in the Supabase project configured in `portable/supabase-project.mjs`. This file contains public connection details only. Vercel no longer requires Turso credentials or Supabase server secrets.

## Backend deployment

Apply `supabase/schema.sql` to the linked project. Application tables live in the private `linkdid` schema with RLS enabled and no anonymous/authenticated direct table grants. Deploy `supabase/functions/linkdid-api` with JWT gateway verification disabled: the function verifies bearer tokens through Supabase Auth itself, while allowing public leaderboard requests. Never remove that verification.

The function uses the standard Supabase server environment for its database and private storage connection. Optional payment/admin secrets belong in Supabase Edge Function secrets. Payments remain disabled until merchant configuration is complete. Photos use the private `profile-photos` bucket.

## Frontend deployment

Vercel imports this repository's main branch. `vercel.json` builds static assets and routes API requests through `api/handler.js`. Run `npm run build:vercel` and `npm test` before deploying. Changing the linked public project configuration requires a rebuild. Preview origins must be explicitly added to the Edge Function CORS allowlist before using authenticated writes from previews.

## Authentication

Email/password sign-in and account creation use Supabase Auth. Email-code sign-in remains available. Configure Supabase's Site URL as `https://linkdid-ai.vercel.app` and allow `https://linkdid-ai.vercel.app/signin` as an authentication redirect. Confirm email delivery with a real mailbox and configure SMTP for production delivery. Protected APIs verify access tokens and ownership independently of browser redirects.

## Verification and data

Check `/api/bootstrap` returns 200 and signed-out `/api/account` returns 401. Verify account creation/email confirmation, password sign-in, profile saving, photo upload and pump persistence with a real test account before inviting customers.

The Supabase application database starts empty. Existing Site/Turso data is not automatically imported; migrating existing profiles requires an explicit verified owner mapping. Legacy portable SQLite adapters and migration scripts remain for the original deployment and tests; they are not used by the Vercel production gateway.
