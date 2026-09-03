# Tina Admin (Phase C)

Web admin for Tina — edit prompts, answer policy, review gaps, view analytics.

## Setup

1. Run `sql/005_admin.sql`, `sql/010_knowledge_hub.sql`, `sql/012_chat_sessions_admin.sql`, and `sql/013_human_reply.sql` in [Supabase SQL Editor](https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new).
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

On **Railway** (WhatsApp + admin sync API), also set `TIS_PORTAL_USERNAME` and `TIS_PORTAL_PASSWORD` so TIS Times can sync from the login-gated parent portal.

For automatic updates, add a **second Railway service** with cron `30 18 * * 2,5` (Wed/Sat 03:30 JST) and start command `python -m tis_agent sync web`. See root `AGENTS.md`.

WhatsApp webhook stays on Railway; admin is a separate app.

## Screens

| Route | Purpose |
|-------|---------|
| `/` | Analytics — sessions, success rate, gaps (7 days) |
| `/chats` | Chat sessions — parent ↔ Tina transcripts, plus human replies |
| `/config` | Full system prompt (grounding, style, tone, answering), fixed answers, policy |
| `/sync` | Manual web & calendar sync + document list |
| `/knowledge` | Knowledge Hub — curated Q&A ingested into the RAG store |
| `/inbox` | Needs attention — reply on WhatsApp, mark reviewed, or add to Knowledge Hub |

## Human replies (human in the loop)

When Tina cannot answer confidently, an admin can answer the parent from **Chats** or
**Needs attention**. Requirements:

- `NEXT_PUBLIC_TINA_API_URL` and `ADMIN_SYNC_SECRET` must be set. The browser posts to
  `/api/reply`, which verifies the Supabase session and `ADMIN_EMAILS` before calling
  Railway, so the secret stays server-side.
- WhatsApp allows a free-form reply for **24 hours** after the parent's last message. The
  composer shows the remaining time and hides itself when the window has expired; Railway
  rejects an expired send with `409`.
- A failed send returns `502`, keeps the question in **Needs attention**, preserves the
  draft, and offers a retry.
- **Send + Add to Knowledge** sends the reply, then opens the Knowledge Hub form with the
  question and verified answer for review before Tina uses it.
