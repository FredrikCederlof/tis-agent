# TIS Agent — nightly knowledge sync

Contract for syncing TIS knowledge from Google Drive into Supabase.

## Goal

Parents ask Tina in WhatsApp. Answers must come from official TIS documents stored in Supabase (`tis-ass` bucket + pgvector chunks).

## Source of truth

- **Google Drive folder:** `1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa`
- **Supabase Storage bucket:** `tis-ass`
- **Supabase project:** `ixjsiwedssgutrmegyzv`

Drop PDFs or Google Docs into the Drive folder. The nightly job uploads new/changed files and re-vectorizes them.

## Nightly sync procedure

Drive sync is a Railway cron service, separate from the WhatsApp service. It walks the knowledge folder (including nested folders such as `Curriculum Guides`), skips files whose Drive `modifiedTime` is already stored, and ingests new or changed files through the existing pipeline. The process prints a summary and exits.

- **Start command:** `python -m tis_agent sync drive`
- **Cron schedule (UTC):** `0 18 * * *` — 03:00 Asia/Tokyo
- **Secrets:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`

`GOOGLE_SERVICE_ACCOUNT_JSON` is a Google service account key (raw JSON or base64). Share the Drive folder with that service account email as a Viewer.

`python -m tis_agent sync file` remains for a single local file. Do **not** send WhatsApp messages or email parents. Do **not** run a second Drive download alongside this command.



## Supported file types

- PDF (`application/pdf`)
- Plain text exports of Google Docs (`text/plain`)
- Markdown (`.md` / `text/markdown`)
- CSV (`.csv` / `text/csv`)
- Other types: skip and report in summary



## Testing

Do not open the browser, run browser-based tests, or take screenshots unless explicitly requested by the user.

For normal feature development:

- Run lint/type checks and relevant automated tests.

- Do not perform visual browser verification automatically.

- Tell the user what should be manually verified instead.

Browser testing is allowed only when the user explicitly asks for it.

## Web and calendar sources

Public URLs can be synced into Supabase (same vector pipeline as Drive files):

```bash
python -m tis_agent sync web
```

Default sources: TIS Tech Portal (Google Sites crawl), parent Google Calendar (iCal), school uniform page, **TIS Times** on the parent portal (login required).

Re-run after the school updates the calendar or web pages.

- **Parent calendar (ICS):** today through **1 year** ahead (Asia/Tokyo; no past events).
- **TIS Times (portal):** today through the **upcoming month** (30 days, today included).

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

Alternative: run `python -m tis_agent sync web` after `sync drive` on Wednesday and Saturday.

## Sunday school-mail bulletin (standalone Cloud Agent)

A **dedicated** Sunday Cursor Cloud Agent on this repo reads school Gmail and ingests a sanitized bulletin into the same RAG store. It is not the family Sunday email product, not a follow-on to that job, and not raw Gmail in the vector store.

**Automation name:** TIS school mail bulletin  
**Repo / branch:** GitHub `FredrikCederlof/tis-agent` / `main` (Automations must use GitHub, not Origin)  
**Schedule:** Sunday **19:30 JST** (`30 10 * * 0` UTC)  
**Tools:** Gmail + this repo checkout  
**Inbox:** the connected parent Gmail. Search **school senders only**. Never search child names.

Do **not** wait for any other agent. Do **not** open other repos. Do **not** send WhatsApp, email parents, or write a family briefing.

```bash
python -m tis_agent sync bulletin /tmp/tis-bulletin-raw.md
```

`--dry-run` prints the sanitized markdown without uploading.

### Procedure every run

1. Checkout GitHub `FredrikCederlof/tis-agent` on `main`.
2. Install deps if needed: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
3. Load secrets: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`.
4. Search Gmail for the last 14 days from school senders only (include trash if school mail was deleted):

```
from:tokyois.com newer_than:14d
from:openapply.com newer_than:14d
from:toddleapp.com OR from:toddle newer_than:14d
from:managebac.com OR from:managebac newer_than:14d
from:schoolsbuddy newer_than:14d
from:seesaw newer_than:14d
```

5. Open matching threads as plain text. Skip personal Gmail/iCloud/Yahoo/Outlook senders and marketing-only mail.
6. Write `/tmp/tis-bulletin-raw.md` using `=== MESSAGE ===` separators with `From` / `Date` / `Subject` headers and the plain-text body.
7. Run `.venv/bin/python -m tis_agent sync bulletin /tmp/tis-bulletin-raw.md` (optional `--dry-run` first to inspect).
8. Confirm the JSON summary has `"status": "synced"` or `"skipped"`. If `"empty"`, report that and stop. Confirm child names are absent from any printed markdown (Eldor, Malte, Vega-Lo, Vega).
9. Print a short summary: threads opened, kept vs dropped blocks, ingest status.

The sanitizer strips Eldor / Malte / Vega-Lo / Vega, **keeps** Kindergarten / Grade 3 / Grade 6 class notices plus PYP/MYP/DP/whole-school items, **drops** personal teacher emails about one child and other single-grade mail (e.g. Grade 10 only), and dedupes triple Toddle sends. Document title: `TIS Weekly Bulletin YYYY-MM-DD` with `source_type: bulletin`.

Only one Sunday bulletin automation should exist. After **TIS school mail bulletin** is saved, disable or delete the older **TIS Sunday weekly bulletin** job.

### Cursor Automation prompt (paste into a new automation)

```
Ingest a sanitized weekly TIS school bulletin into Tina’s knowledge base.

This job is standalone. Use Gmail on the connected account. Search school senders only. Do not search child names. Do not send WhatsApp, do not email anyone, and do not write a family briefing.

Procedure:
1. Install deps if needed: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
2. Load secrets: SUPABASE_URL, SUPABASE_SECRET_KEY, OPENAI_API_KEY.
3. Search Gmail for the last 14 days (include trash if school mail was deleted):
   - from:tokyois.com newer_than:14d
   - from:openapply.com newer_than:14d
   - from:toddleapp.com OR from:toddle newer_than:14d
   - from:managebac.com OR from:managebac newer_than:14d
   - from:schoolsbuddy newer_than:14d
   - from:seesaw newer_than:14d
4. Open matching threads as plain text. Skip personal Gmail/iCloud/Yahoo/Outlook senders.
5. Write /tmp/tis-bulletin-raw.md using === MESSAGE === separators with From / Date / Subject headers and the plain-text body.
6. Run: .venv/bin/python -m tis_agent sync bulletin /tmp/tis-bulletin-raw.md
7. Confirm JSON "status" is "synced" or "skipped". If "empty", report and stop.
8. Confirm child names are absent from printed markdown (Eldor, Malte, Vega-Lo, Vega). Personal teacher notes about one child must not appear.
9. Print threads opened, kept vs dropped blocks, and ingest status.

Document title is TIS Weekly Bulletin YYYY-MM-DD (Asia/Tokyo date of the run) with source type bulletin.
```

## Idempotency

Re-running sync on an unchanged file should print `"status": "skipped"`.

## Manual test

```bash
python -m tis_agent sync state
python -m tis_agent ask "What does TIS say about reporting an absence?"
python -m tis_agent ask "Hi. Is there anything special happening at school today?"
python -m tis_agent eval --list
python -m tis_agent eval
```

`eval` scores 20 gold questions drawn from the Drive corpus (handbook, fees, health, bus, BtB, calendar). It needs the same secrets as `ask`: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY` as Cloud Agent environment secrets. Unit tests (`pytest`) do not need those secrets.

Date/event questions retrieve from the parent calendar **and** handbook/bulletin/web. Do not calendar-only short-circuit.
