# TIS Agent — decisions

Short record of product intent. Change these only with a reason.

## Product

- **Name:** Tina, a TIS school-information assistant delivered through WhatsApp.
- **Problem:** Parents cannot quickly find official school information that already exists.
- **User:** Any TIS parent, Kindergarten through Grade 12. Not a family-specific assistant.
- **Outcome:** A parent asks in natural language and gets a short, trustworthy answer from TIS source material.
- **Interface:** WhatsApp is the only parent-facing interface. No parent web app.
- **This project is not** the TIS weekly email briefing. Separate product, separate sources, separate repo.

## Knowledge

- Shared knowledge base for all parents. No per-family email corpus.
- Sources are generic school documents: handbook, policies, calendar, bus information, and similar.
- Ingest formats: PDFs and Google Docs. Not Gmail.
- Documents are uploaded to Supabase, then embedded for RAG.
- Metadata (title, type, dates, grade/section, source) is first-class. Semantic similarity alone is not enough.

## Trust

- Answers must be grounded in retrieved TIS material.
- Prefer official and newer information when sources conflict.
- If evidence is missing, say so. Do not invent school facts.
- Show source when it adds trust. Keep WhatsApp replies short.

## Out of scope until later

- Live WhatsApp Business delivery (after answer quality is proven).
- Per-child personalization from a parent profile.
- Japanese-language sources (first corpus is English).

## Milestone 1

Prove reliable answers over the *Community Handbook 2026–2027* (English PDF), using a WhatsApp-style reply format, with no live WhatsApp.

## Milestone 2

Google Drive folder → Supabase Storage (`tis-ass`) → pgvector sync, with a nightly Cloud Agent at 03:30.

- Drive folder id: `1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa`
- Sync tracks `drive_file_id`, `drive_modified_time`, and `content_hash` on `documents`
- Nightly agent uses Google Drive MCP + `python -m tis_agent sync file ...`
- Run `sql/002_sync.sql` once after `001_rag.sql`
