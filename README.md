# TIS Agent

WhatsApp assistant (**Tina**) for Tokyo International School parents.

Parents ask ordinary questions about school information. Tina answers from official TIS documents stored as embeddings in Supabase. There is no parent-facing web app.

This repo is separate from the family weekly briefing.

## Status

Milestone 2: Google Drive → Supabase Storage → nightly vector sync.

## Setup

1. Copy `.env.example` to `.env` and set `SUPABASE_SECRET_KEY` plus `OPENAI_API_KEY` (`sk-...`).
2. Run `sql/001_rag.sql` then `sql/002_sync.sql` in the [Supabase SQL Editor](https://supabase.com/dashboard/project/ixjsiwedssgutrmegyzv/sql/new).
3. Install deps: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
4. Drop TIS PDFs/Docs in the [Google Drive knowledge folder](https://drive.google.com/drive/folders/1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa).

## Commands

```bash
python -m tis_agent sync state
python -m tis_agent sync file /path/to/file.pdf \
  --title "Community Handbook 2026-2027" \
  --mime-type application/pdf \
  --drive-id DRIVE_FILE_ID \
  --modified 2026-08-24T08:35:15Z
python -m tis_agent ask "What does TIS say about reporting an absence?"
python -m tis_agent chat
```

Nightly sync instructions: see `AGENTS.md`.
