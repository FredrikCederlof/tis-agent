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
5. Use **Google Drive** integration to list files in folder `1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa`.
6. For each file (skip subfolders):
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
- Other types: skip and report in summary

## Idempotency

Re-running sync on an unchanged file should print `"status": "skipped"`.

## Manual test

```bash
python -m tis_agent sync state
python -m tis_agent ask "What does TIS say about reporting an absence?"
```
