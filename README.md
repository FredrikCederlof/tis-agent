# TIS Agent

WhatsApp assistant (**Tina**) for Tokyo International School parents.

Parents ask ordinary questions about school information. Tina answers from official TIS documents stored as embeddings in Supabase. There is no parent-facing web app.

This repo is separate from the family weekly briefing.

## Status

Milestone 3: WhatsApp test preview (Meta Cloud API test number).

## Setup

1. Copy `.env.example` to `.env` and set `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY` (`sk-...`), and WhatsApp vars.
2. Run `sql/001_rag.sql` through `sql/004_agent_config.sql` in the [Supabase SQL Editor](https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new).
3. Install deps: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
4. Drop TIS PDFs/Docs in the [Google Drive knowledge folder](https://drive.google.com/drive/folders/1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa).

## Commands

```bash
python -m tis_agent sync state
python -m tis_agent ask "What does TIS say about reporting an absence?"
python -m tis_agent chat
python -m tis_agent whatsapp   # webhook on http://0.0.0.0:8080/webhook
```

### WhatsApp test preview (local)

1. Start webhook: `python -m tis_agent whatsapp`
2. Expose with a tunnel (Cloudflare Tunnel or ngrok) to `https://YOUR_HOST/webhook`
3. In Meta App → WhatsApp → Configuration: Callback URL = that URL, Verify token = `WHATSAPP_VERIFY_TOKEN`
4. Subscribe to the `messages` field
5. Message the Meta test number from your allowed WhatsApp phone

### Deploy WhatsApp webhook (Railway)

Always-on hosting so Meta has a stable Callback URL (no cloudflared churn).

1. Push this repo to GitHub.
2. Create a Railway project from the GitHub repo (Nixpacks + `railway.toml`).
3. Set env vars from `.env.example` (at least `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`).
4. Generate a Railway public domain; Callback URL = `https://YOUR_RAILWAY_HOST/webhook`.
5. In Meta → WhatsApp → Configuration: paste that URL, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`.

Nightly Drive → Supabase sync stays on Cursor Cloud Agents (`AGENTS.md`), not on Railway.

Nightly sync instructions: see `AGENTS.md`.
