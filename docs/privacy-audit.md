# Tina — privacy and security audit

**Date:** 9 October 2026  
**Scope:** Live Supabase project `ixjsiwedssgutrmegyzv` (TIS-agent), Railway project `diligent-quietude`, and git `main` at `fec9d50`.  
**Method:** Read-only. Counts and schema only. No message text, phone numbers, or emails are copied here.  
**Status of this document:** An engineering audit for a parent-run assistant. It is not a legal opinion and it does not establish compliance with the Act on the Protection of Personal Information (APPI). The Personal Information Protection Commission does not certify apps as “APPI approved.” Guidance: [ppc.go.jp](https://www.ppc.go.jp/).

**Access fix applied the same day** in [sql/008_access_control.sql](../sql/008_access_control.sql), on the live database:

- Anonymous reads of `admin_session_list` now fail with permission denied. The three admin views run as the querying user (`security_invoker`).
- A signed-in user who is not an active admin sees 0 conversation rows. An active admin still sees the 25 interactions and 18 sessions.
- New accounts no longer take `admin` from editable signup metadata. An unexpired row in `admin_invitations` is the only way to receive a role. The two existing admins are unchanged.
- The `tis-ass` bucket is private.
- Webhook logs in this repo no longer include the phone number or question text. That line takes effect when this commit is deployed to Railway.

Still manual: turn off public sign-up in the Supabase Auth dashboard, and enroll MFA for both admin users (0 factors). Phase 3 (privacy notice and retention) has not started.

Labels used below:

- **Confirmed** — checked in this repo or on the live project on this date
- **Unverified** — not checked, or checked only in part
- **External** — needs a provider dashboard or a lawyer

## 1. What Tina is

Tina is a private WhatsApp assistant for parents, operated independently of Tokyo International School. Parents have no web app. Staff use Tina Admin.

This checkout’s product copy still describes Tina as a school-information assistant grounded in official TIS sources ([admin/app/login/page.tsx](admin/app/login/page.tsx), [decisions.md](decisions.md)). There is no privacy notice.

The live database is ahead of this git tree. Views, admin profiles, translation columns, and audit tables exist in Supabase and are not created by [sql/001_rag.sql](sql/001_rag.sql) through [sql/007_temporal.sql](sql/007_temporal.sql). Findings below follow the live project, not only the files in git.

## 2. Personal data held on 9 October 2026

| Store | What | Volume | Retention today |
|---|---|---|---|
| `chat_sessions` | WhatsApp phone (`wa_from`), language, timestamps | 18 sessions, 5 distinct numbers | Since 29 Aug 2026. No purge. |
| `interactions` | Phone, question, reply, and for 13 of 25 rows an English copy (`question_en`, `reply_en`) | 25 rows, newest 9 Oct 2026 | No purge. |
| `whatsapp_message_dedup` | Phone and full question text | 225 rows, oldest 27 Aug 2026 | No purge. |
| `admin_replies` | Staff reply text linked to a session | 3 rows | No purge. |
| `sandbox_messages` | Admin test chats, scoped to the signed-in user | 22 rows | No purge. |
| `knowledge_entries` | Saved Q&A used as knowledge | 14 rows | Kept until someone deletes one. |
| `documents` / `chunks` | Indexed school material, not a parent profile | 80 documents, 2,185 chunks | Kept. |
| `storage` bucket `tis-ass` | Source files | 70 objects | Kept. |
| `auth.users` / `admin_profiles` | Admin email, name, role | 2 users, both `admin` / `active` | Kept. |
| `admin_audit_events` | Admin action, actor id, target email | 7 events, all `knowledge_entry_deleted` | No conversation-access events. |

`auth.mfa_factors` has **0** rows. Neither admin has MFA enrolled. **Confirmed.**

This git tree’s logger ([tis_agent/analytics.py](tis_agent/analytics.py)) does not write `question_en` or `reply_en`. There is no trigger and no Supabase Edge Function that fills them. Rows created on 8–9 October 2026 still have translations. **The writer is unverified.** Treat those columns as a second copy of parent messages until that writer is found.

## 3. Data flow

```text
Parent WhatsApp
  -> Meta Cloud API
  -> Railway tis-agent (Amsterdam), python -m tis_agent whatsapp
       -> OpenAI (current question + retrieved excerpts; phone not in that prompt)
       -> Supabase (Tokyo): sessions, interactions, dedup
  -> Vercel Tina Admin reads Supabase with the anon key and a staff session
Railway tis-drive-sync (Amsterdam, cron 03:00 Asia/Tokyo) reads Google Drive and writes documents
```

**Confirmed in this repo**

- The webhook rejects a body that fails `X-Hub-Signature-256` ([tis_agent/whatsapp.py](tis_agent/whatsapp.py)).
- WhatsApp calls `answer_question(text)` with no prior turns. The prompt contains the question and document excerpts, not the phone number ([tis_agent/ask.py](tis_agent/ask.py)).
- Admin sign-in in this repo is a magic link plus an `ADMIN_EMAILS` allowlist in [admin/middleware.ts](admin/middleware.ts). That allowlist is not what the database policies use.
- TRMNL output in this repo omits phone numbers.
- Bulletin chunks do not contain the strings Eldor, Malte, or Vega (0 hits). That is not a full read of bulletin text.

**Confirmed on live infrastructure**

- Supabase region `ap-northeast-1` (Tokyo). Postgres 17. Project status healthy.
- Railway services `tis-agent` and `tis-drive-sync` each run one replica in `ams` (Amsterdam).
- Variable **names** on the WhatsApp service include `TIS_PORTAL_USERNAME`, `TIS_PORTAL_PASSWORD`, and three Slack webhook URLs, including `SLACK_WEBHOOK_PARENT_QUESTIONS`. This commit contains no Slack code. Whether those webhooks receive parent text is **unverified**. The portal password sitting on the public webhook service is **confirmed** as a placement fact. Values were not read.

**External**

- OpenAI API retention and training settings, Meta’s retention, Google’s role, Vercel’s region, and Railway’s log retention window were not opened. Railway application logs were not downloaded, because they can contain the phone number and the start of the question (`Inbound from %s: %s` in [tis_agent/whatsapp.py](tis_agent/whatsapp.py)).

## 4. Controls that hold

- Webhook signature check. **Confirmed.**
- Phone number is not sent in the WhatsApp model prompt in this repo. **Confirmed.**
- `documents` and `chunks` have RLS on and no policies. Direct reads by `anon` and `authenticated` are denied. `match_chunks` is `SECURITY INVOKER`, so those roles do not receive chunk text through the function. The service role used by Railway does. **Confirmed.**
- `whatsapp_message_dedup` has RLS on and no policy, so the Data API does not expose it to `anon` or `authenticated`. The service role still stores the question text. **Confirmed.**
- `admin_audit_events`, `admin_invitations`, and `admin_push_deliveries` have RLS and no policies. **Confirmed.**
- Bucket `tis-ass` is flagged `public`, but there is no storage SELECT policy for it. As the `anon` role, 0 of 70 objects were visible. **Confirmed** for today. The public flag remains a foot-gun.
- Sandbox conversations are limited to `auth.uid()`. **Confirmed** in policy text.
- Admin avatar bucket is world-readable by policy. That is appropriate only for avatars.

## 5. Findings

### C1 — Anonymous clients can read parent sessions

**Severity:** Critical. **Status:** Confirmed.

`public.admin_session_list` is a `SECURITY DEFINER` view owned by `postgres`, and `anon` has `SELECT`. The view returns `wa_from`, the last question, and the last reply. Supabase’s own linter reports this: [security definer view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

Probe on 9 October 2026, count only: as role `anon`, `admin_session_list` returned **18** rows. As role `anon`, the `interactions` table returned **0** rows, because its policy is for `authenticated` only. The view goes around that policy.

The anon key is the key Tina Admin ships to the browser (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Anyone who has it can call the Data API for this view without signing in.

`unanswered_interactions` is the same kind of view and includes `wa_from`, `question`, and `reply`. It currently has 0 rows, so the probe could not show a leak. The grant and owner are the same, so the exposure appears as soon as a row exists.

`admin_stats_7d` is aggregates only. Same definer pattern, lower impact.

**Fix in Phase 2:** recreate these views with `security_invoker = true`, revoke `anon` (and any unused) privileges, and do not grant them to `authenticated` until the underlying policies are restricted.

### C2 — Any signed-in user can read and delete every parent conversation

**Severity:** Critical. **Status:** Confirmed.

Policies on the live database, all `TO authenticated` with `USING (true)`:

- `interactions`: `SELECT`, `UPDATE`
- `chat_sessions`: `SELECT`, `UPDATE`, `DELETE`
- `agent_config`: `SELECT` (update is the one policy that calls `is_active_admin()`)
- `admin_replies`: `SELECT`
- `knowledge_entries`: `SELECT`, `INSERT`, `UPDATE`
- `admin_profiles`: `SELECT` for every signed-in user

Probe: as role `authenticated`, `interactions` returned **25** rows. The policy does not check `is_active_admin()` or `ADMIN_EMAILS`.

`chat_sessions` delete cascades to `interactions`. Row level security is not forced (`relforcerowsecurity = false`), so a cascade from a session delete removes the messages.

The Next.js allowlist never runs for a direct Supabase API call.

**Fix in Phase 2:** `SELECT` / `UPDATE` / `DELETE` on conversation tables require `is_active_admin()`. Revoke the broad grants that are not needed. Keep webhook writes on the service role.

### C3 — Signup can grant the admin role from editable user metadata

**Severity:** Critical if public sign-up is on. **Status:** Trigger confirmed. Sign-up setting unverified.

Trigger `on_auth_user_created_admin_profile` runs `handle_admin_profile_create()` after insert on `auth.users`. The function is `SECURITY DEFINER` and sets `role` from `raw_user_meta_data->>'admin_role'`, defaulting to `member`, and `status` from `raw_user_meta_data->>'admin_status'`, defaulting to `active`.

`raw_user_meta_data` is user-editable. It must not decide who is an admin. Both existing users are `admin` / `active`. Whether they were assigned that way was not reconstructed.

`is_active_admin()` and `handle_admin_profile_create()` are executable by `anon` and `authenticated` ([linter 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [linter 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).

Public sign-up enabled or disabled was **not** visible from SQL. **Unverified.**

**Fix in Phase 2:** stop reading role and status from user metadata. Assign `member` only, and set `admin` from a path you control. Revoke `EXECUTE` from `anon` and `authenticated`. Confirm in the Auth dashboard that public sign-up is off. Enroll TOTP for both admins (0 factors today).

### H1 — Conversation data is kept with no end date

**Severity:** High. **Status:** Confirmed.

No retention column, no purge job, no delete-by-phone flow. Dedup holds 225 question texts against 25 logged answers, so the dedup table is the larger copy of what parents typed. Supabase backup and point-in-time recovery windows were **not** visible in the project API. **Unverified.** A later delete of live rows will not erase backups on the same day.

**Fix in Phase 3:** retention limited to 30, 90, 180, or 365 days (default 90), daily purge of sessions, interactions, dedup, and admin replies older than that, plus delete-by-phone for a request.

### H2 — Railway logs can contain the phone number and question text

**Severity:** High. **Status:** Confirmed in code. Log retention window unverified.

[tis_agent/whatsapp.py](tis_agent/whatsapp.py) logs `Inbound from {phone}: {first 80 characters}`. The service runs in Amsterdam. How long Railway keeps those lines was not checked, and the lines were not downloaded.

**Fix in Phase 2:** log a message id and outcome only.

### H3 — Any indexed document can be sent to the model for any parent

**Severity:** High. **Status:** Confirmed for the control. Content of each file was not read.

`match_chunks` filters only by optional `source_type`. There is no `public` / `parents_only` / `restricted` column. Drive sync and portal sync will embed whatever is in the folder or the crawl.

Indexed set by `source_type`: bulletin 30, pdf 19, knowledge 14, document 11, web 3, handbook 1, policy 1, calendar 1.

Titles that are sensitive topics, indexed with everything else:

- Health: Asthma Action Plan, Authorization for Medications, Communicable Disease Protocols, Influenza Confinement Policy, Night Emergency for children, Over the Counter Medicine in Japan
- People and records: Staff List School, How to Access/Download Previous Report Cards
- Login-gated source: TIS Times (Parent Portal)
- Money: TIS School Fees Agreement

These titles do not prove that a file contains a named student’s health record or grades. They do prove there is no gate before retrieval. Google Drive itself was not opened (Drive access was not authenticated). Files in the Drive folder that are not yet in `documents` were **not** listed.

Bulletin name-string check for three child names: 0 hits. **Confirmed** for those strings only.

**Fix:** Before other parents use Tina, mark or remove staff lists, health forms, fee agreements, and anything student-specific. Phase 3 adds `access_class` and keeps `restricted` out of `match_chunks`. Phase 2, if you want it sooner, is simply to stop syncing and delete the sensitive documents. That decision is yours; this audit did not delete anything.

### H4 — Parents are not told what Tina does with their messages

**Severity:** High. **Status:** Confirmed.

No `/privacy` page. Login has no privacy link. WhatsApp sends no first-contact notice. Purpose of use, providers, retention, and a contact for access or deletion are unpublished.

**Fix in Phase 3:** the public notice, the login link, the disclaimer, and one WhatsApp line on first contact. Japanese text before anyone outside a private test is invited. A lawyer reviews it in Phase 4.

### M1 — Admin actions on conversations are not audited

**Severity:** Medium. **Status:** Confirmed.

`admin_audit_events` exists and is closed by RLS, which is right. The only action stored is `knowledge_entry_deleted` (7). Nothing records that an admin opened, exported, or deleted a parent conversation.

**Fix:** Phase 3 records purge and delete-by-phone in `privacy_events`. A log of every inbox view is deferred until a second operator needs it.

### M2 — Schema and application are out of sync

**Severity:** Medium. **Status:** Confirmed.

Git `main` at `fec9d50` matches `origin/main` and does not define `admin_session_list`, `admin_profiles`, or the signup trigger. The live database does. Railway is configured to deploy that same `main` branch, and recent interactions still contain translation columns this tree does not write.

**Fix:** Before Phase 2 SQL, dump or reconcile the live policies into the repo so the next migration does not assume [sql/005_admin.sql](sql/005_admin.sql) is the whole story.

### M3 — `tis-ass` is marked public

**Severity:** Medium. **Status:** Confirmed. Current anon visibility is 0.

Bucket `public = true`, 70 objects, no SELECT policy, anon count 0. A later broad policy would expose handbooks and the sensitive titles in H3.

**Fix in Phase 2:** set the bucket to private. Keep downloads on the service role.

### M4 — Portal and Slack secrets are on the webhook service

**Severity:** Medium. **Status:** Names confirmed. Use unverified.

`TIS_PORTAL_PASSWORD` and Slack webhook URLs are environment variables on the long-running public Railway service. Drive sync does not have the portal password. This commit does not reference Slack. Values were not printed.

**Fix in Phase 2:** remove secrets this process does not use. Keep portal credentials only on the job that logs into the portal.

### L1 — Linter items that are not the parent-data leak

**Severity:** Low to medium. **Status:** Confirmed by the Supabase security advisor.

- `match_chunks` and `chunks_overlapping_dates` have a mutable `search_path`. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- Extension `vector` is in `public`. [Remediation](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
- Leaked-password protection is disabled. [Remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Relevant only if password sign-in exists. Whether it does is **unverified**. Admins use magic links in this repo.

### L2 — Encryption

**Severity:** Low as a gap in evidence, not as a known break. **Status:** Mixed.

Browser, webhook, and Supabase API URLs are HTTPS. **Confirmed** as configuration, not as a packet capture. Disk encryption for Supabase and Railway was not independently tested. **Unverified** beyond ordinary provider defaults. No application-level encryption of `wa_from` or question text. For this scale, provider encryption in transit and at rest is the proportionate control, once the access hole in C1–C2 is closed.

## 6. What to do, in order

Phase 1 was this report. No code was changed.

**Phase 2 — access, before any new privacy UI**

1. Close C1: definer views and `anon` select on session and message views.
2. Close C2: conversation policies require `is_active_admin()`.
3. Close C3: role assignment no longer trusts user metadata; confirm sign-up is disabled; enroll MFA.
4. Redact webhook logs (H2).
5. Set `tis-ass` private (M3). Remove unused portal and Slack secrets from the webhook service (M4).
6. Bring the live policies back into git (M2) before writing new SQL.

**Phase 3 — notice and retention**

1. Public `/privacy` page linked from the login screen, with the independent-assistant disclaimer.
2. One WhatsApp notice the first time a number is stored.
3. Admin choice of 30, 90, 180, or 365 days, default 90, and a daily purge.
4. Delete and export one phone number on request.
5. `access_class` on documents so `restricted` never reaches OpenAI. Until that ships, remove or un-index the sensitive titles in H3 if you do not want them answered to every parent.

**Phase 4 — validation, still not a compliance claim**

Tests for the view grants, the admin-only policies, the retention constraint, and the purge. You complete the provider checklist below. A Japanese privacy lawyer reviews the notice and the questions in section 8.

## 7. Provider checklist (for you, not for this repo)

| Provider | What to record | Status |
|---|---|---|
| Meta WhatsApp | What Meta stores, for how long, and in which countries | External |
| Railway | Amsterdam confirmed. Log retention, DPA, disk encryption | Region confirmed. Rest external |
| Supabase | Tokyo confirmed. Backup window, DPA, Auth sign-up toggle | Region confirmed. Rest external |
| OpenAI | Whether API data is used for training, and the retention period | External |
| Google | Drive folder sharing, and whether the service account should see staff or health files | External. Indexed titles confirmed |
| Vercel | Region and who can open the admin project | External |

## 8. Questions for a Japanese privacy lawyer

These are not answered by this audit.

- While only a handful of numbers use a test bot, is Tina still household use, or already a personal-information handling business operator because messages are stored systematically?
- For Meta, OpenAI, Supabase, Railway, Vercel, and Google: which are entrusted parties, and what must parents be told about handling outside Japan? The database is in Tokyo. The webhook process is in Amsterdam. Model processing is a further country.
- Do health-topic documents, a staff list, or a parent message about a child’s illness require consent, or is a published purpose plus short retention enough?
- Does indexing TIS Times with a parent portal login, or a Drive folder of school documents, need the school’s authority before anyone else uses Tina?
- Who is named as the contact for disclosure, correction, and deletion?

Ordinary question-answering should not grow a consent-version database unless counsel names a specific APPI consent trigger. PrivacyMark is a voluntary certification and is out of proportion for this parent project.

## 9. Suggested notice text (draft, not published)

> Tina is an independent AI-powered information assistant created by a parent to help families navigate everyday school life.
>
> Tina is not affiliated with, endorsed by, or operated by Tokyo International School.
>
> AI-generated responses may contain inaccuracies. For official information, please contact TIS directly.
>
> Please avoid sharing sensitive personal information about students, families, or staff.

Publish that only together with what is stored, why, which providers are involved, the retention period, and how to ask for access or deletion. Have the Japanese text reviewed before other parents are invited.
