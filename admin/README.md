# Tina Admin (Phase C)

Web admin for Tina — edit prompts, answer policy, review gaps, view analytics.

## Setup

1. Run `sql/005_admin.sql` in [Supabase SQL Editor](https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new).
2. In Supabase → Authentication → Providers: enable **Email** (magic link).
3. In Supabase → Authentication → URL configuration, add redirect URL:
   - Local: `http://localhost:3000/auth/callback`
   - Production: `https://YOUR_ADMIN_HOST/auth/callback`
4. Copy `admin/.env.example` to `admin/.env.local` and fill values.
5. Install and run:

```bash
cd admin
npm install
npm run dev
```

Open http://localhost:3000 — sign in with an email listed in `ADMIN_EMAILS`.

## Deploy (Vercel recommended)

1. Import the repo in Vercel; set **Root Directory** to `admin`.
2. Env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key from Supabase)
   - `ADMIN_EMAILS` (comma-separated staff emails)
   - `NEXT_PUBLIC_TINA_API_URL` (Railway app URL)
   - `ADMIN_SYNC_SECRET` (same secret as Railway `ADMIN_SYNC_SECRET`)
3. Add the Vercel URL to Supabase Auth redirect URLs.

WhatsApp webhook stays on Railway; admin is a separate app.

## Screens

| Route | Purpose |
|-------|---------|
| `/` | Analytics — sessions, success rate, gaps (7 days) |
| `/config` | System prompt, fixed answers, strict grounding policy |
| `/sync` | Manual web & calendar sync + document list |
| `/inbox` | Unanswered questions — mark reviewed |
