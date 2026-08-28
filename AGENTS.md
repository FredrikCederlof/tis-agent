# TIS Agent — nightly knowledge sync

Cloud agent contract for syncing TIS knowledge from Google Drive into Supabase.

## Goal

Parents ask Tina in WhatsApp. Answers must come from official TIS documents stored in Supabase (`tis-ass` bucket + pgvector chunks).

## Source of truth

- **Google Drive folder:** `1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa`
- **Supabase Storage bucket:** `tis-ass`
- **Supabase project:** `ixjsiwedssgutrmegyzv`

Drop PDFs or Google Docs into the Drive folder. The nightly job uploads new/changed files and re-vectorizes them.

## Nightly sync procedure

1. Read `decisions.md` for product constraints.
2. Install deps if needed: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
3. Load secrets from environment (Cloud Agent secrets / `.env`):
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `OPENAI_API_KEY`
4. Run `python -m tis_agent sync state` to list currently synced documents.
5. Use **Google Drive** integration to list files in folder `1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa`, **including nested subfolders** (e.g. `Curriculum Guides`). Walk folders recursively.
6. For each file (skip folder entries themselves, but process files inside them):
   - Compare `id` + `modifiedTime` with synced state from step 4.
   - If missing or `modifiedTime` is newer, download the file:
     - PDF: download as-is
     - Google Doc (`application/vnd.google-apps.document`): export as `text/plain` or `application/pdf`
   - Save to `/tmp/tis-sync/<filename>`
   - Run:

```bash
.venv/bin/python -m tis_agent sync file /tmp/tis-sync/<filename> \
  --title "<Drive title without extension if needed>" \
  --mime-type "<mime type>" \
  --drive-id "<Drive file id>" \
  --modified "<Drive modifiedTime ISO>"
```

7. Print a short summary: synced / skipped / failed per file.
8. Do **not** send WhatsApp messages or email parents.

## Supported file types

- PDF (`application/pdf`)
- Plain text exports of Google Docs (`text/plain`)
- Markdown (`.md` / `text/markdown`)
- CSV (`.csv` / `text/csv`)
- Other types: skip and report in summary

## Web and calendar sources

Public URLs can be synced into Supabase (same vector pipeline as Drive files):

```bash
python -m tis_agent sync web
```

Default sources: TIS Tech Portal (Google Sites crawl), parent Google Calendar (iCal), school uniform page, **TIS Times** on the parent portal (login required).

Re-run after the school updates the calendar or web pages. Calendar and TIS Times use a **3-week forward window** (today through +21 days in Asia/Tokyo; no past weeks).

After `sql/007_temporal.sql`, calendar events are one chunk per event with `start_date` / `end_date`. Re-run `python -m tis_agent sync web` so the parent calendar is re-chunked. Date questions ("today", "this week", "next Thursday") resolve in Asia/Tokyo; school weeks are Monday–Friday.

### Login-gated portal (TIS Times)

`https://portal.tokyois.com/tis-times/` uses WordPress Ultimate Member login. Set these secrets (never commit):

- `TIS_PORTAL_USERNAME`
- `TIS_PORTAL_PASSWORD`

On Railway, add the same vars so admin **Sync web & calendar** can ingest TIS Times. Without them, that source is skipped and other web sources still sync.

Sync only the portal section:

```bash
python -m tis_agent sync web --url "https://portal.tokyois.com/tis-times/" --title "TIS Times (Parent Portal)"
```

## Bi-weekly web sync (Wed + Sat)

Run `sync web` twice a week so TIS Times, calendar, and public pages stay fresh. Unchanged documents are **skipped** automatically (content hash) — only new or edited text is re-embedded.

**Recommended: Railway cron service** (separate from the WhatsApp service):

1. In Railway, add a new service from the same `tis-agent` repo.
2. **Start command:** `python -m tis_agent sync web` (or `bash scripts/sync_web_sources.sh`)
3. **Cron schedule** (UTC): `30 18 * * 2,5` → **Wed & Sat 03:30 JST**
4. Copy the same secrets as production: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `TIS_PORTAL_USERNAME`, `TIS_PORTAL_PASSWORD`
5. The service must **exit** when sync finishes (do not run the WhatsApp server on this service).

Alternative: extend the nightly Cloud Agent procedure to run `sync web` after Drive sync on the same days.

## Idempotency

Re-running sync on an unchanged file should print `"status": "skipped"`.

## Manual test

```bash
python -m tis_agent sync state
python -m tis_agent ask "What does TIS say about reporting an absence?"
```
