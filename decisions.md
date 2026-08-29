# TIS Agent — decisions

Short record of product intent. Change these only with a reason.

## Product

- **Name:** Tina, a TIS school-information assistant delivered through WhatsApp.
- **Problem:** Parents cannot quickly find official school information that already exists.
- **User:** Any TIS parent, Kindergarten through Grade 12. Not a family-specific assistant.
- **Outcome:** A parent asks in natural language and gets a short, trustworthy answer from TIS source material.
- **Interface:** WhatsApp is the only parent-facing interface. No parent web app.
- **This project is not** the family Sunday email briefing (`TIS-Summary`). That product stays separate and is never a dependency. Tina’s weekly bulletin is a **dedicated Sunday Cloud Agent** that searches school Gmail (tokyois / Toddle / OpenApply / ManageBac / SchoolsBuddy / Seesaw) and ingests a sanitized bulletin. Never raw Gmail. Never the family HTML.

## Knowledge

- Shared knowledge base for parents. No child names in RAG.
- Sources are generic school documents: handbook, policies, calendar, bus information, **sanitized weekly bulletin**, and similar.
- Ingest formats: PDFs, Google Docs, public web/calendar pages, and a Sunday bulletin from a **standalone** school-Gmail Cloud Agent after name stripping. Not raw Gmail. Not the family weekly briefing HTML. Not a piggyback on any other agent.
- The weekly bulletin **strips** the names Eldor, Malte, and Vega-Lo / Vega, then **keeps** Kindergarten, Grade 3, and Grade 6 class notices plus school-wide / PYP / MYP / DP facts. It **drops** personal teacher emails directed at one child (and parent Gmail/iCloud threads). Other single-grade mail (e.g. Grade 10 only) is dropped.
- Documents are uploaded to Supabase, then embedded for RAG.
- Metadata (title, type, dates, grade/section, source) is first-class. Semantic similarity alone is not enough.
- Date and event questions search **all** official sources (parent calendar, handbook, bulletin, portal/web), not the calendar alone. The calendar remains the schedule list; other documents add context when they mention that date or event. TIS 6-day rotation labels (Day 1–6) are not treated as special events.
- Calendar events are labeled for student attendance (`holiday` / `no_student_day` / `special_event`). “Is it school on X?” and “list student-free days” use those labels. No Number Day is still a school day unless the calendar says otherwise.
- WhatsApp sessions load recent Q&A history so follow-ups (“Are you sure?”, “What about the 22nd?”) rewrite into standalone lookups. Greetings skip RAG.

## Trust

- Answers must be grounded in retrieved TIS material.
- Prefer official and newer information when sources conflict.
- If evidence is missing, say so. Do not invent school facts.
- Show source when it adds trust. Keep WhatsApp replies short.
- **Strict grounding (admin-steerable in Phase C):** Tina must not answer school questions unless official TIS knowledge supports it. When she cannot find a good match, she returns a clear “no official source” message — not a guess. Fixed answers (e.g. who is Tina) are the only exception.

## Out of scope until later

- School-wide production WhatsApp number and Meta business verification.
- Per-child personalization from a parent profile.
- Japanese-language sources (first corpus is English).

## Milestone 4 (in progress)

Admin, analytics, and configurable Tina behavior.

- **Phase A:** Log every WhatsApp Q&A to Supabase (`chat_sessions`, `interactions`); 10-minute session rule; classify outcomes (`success`, `no_evidence`, `low_confidence`, `error`). SQL: `sql/003_analytics.sql`.
- **Phase B:** Editable system prompt + fixed answers (who is Tina, operator) from DB. SQL: `sql/004_agent_config.sql`.
- **Phase C:** Admin web UI (`admin/`) — Supabase Auth, prompt editor, answer policy (strict grounding), unanswered inbox, analytics. SQL: `sql/005_admin.sql`.
- **Phase D (next):** Weekly email summary of gaps.

## Milestone 1

Prove reliable answers over the *Community Handbook 2026–2027* (English PDF), using a WhatsApp-style reply format, with no live WhatsApp.

## Milestone 2

Google Drive folder → Supabase Storage (`tis-ass`) → pgvector sync, with a nightly Cloud Agent at 03:30.

- Drive folder id: `1P0XZLFtIBivKEx55BjvUZH6_xsWZUDZa`
- Sync tracks `drive_file_id`, `drive_modified_time`, and `content_hash` on `documents`
- Nightly agent uses Google Drive MCP + `python -m tis_agent sync file ...`
- Run `sql/002_sync.sql` once after `001_rag.sql`
- Nested Drive subfolders are in scope (e.g. `Curriculum Guides`). Nightly sync must walk recursively.

## Milestone 3

WhatsApp test preview via Meta Cloud API test number.

- Webhook: `python -m tis_agent whatsapp` (FastAPI; local `:8080`, Railway uses `$PORT`)
- Flow: inbound WhatsApp text → `answer_question` → Cloud API reply
- Production-style hosting: Railway (stable HTTPS for Meta). Local cloudflared only for ad-hoc debug.
- Nightly Drive sync remains on Cursor Cloud Agents, not Railway.
- No parent-facing web app
