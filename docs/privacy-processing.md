# Tina — processing note

Internal briefing for counsel. Not a legal opinion and not a statement that Tina complies with the Act on the Protection of Personal Information.

Checked against the system on 9 October 2026. See [privacy-audit.md](privacy-audit.md) for the evidence.

## Who operates Tina

A parent, privately. Tina is not a Tokyo International School service. The school has not authorized this assistant.

## What is stored, why, and for how long

| Data | Why | Where | Retention |
|---|---|---|---|
| WhatsApp phone number, message, reply, language, time, document titles used | Answer the question and review gaps | Supabase `chat_sessions`, `interactions` (Tokyo) | Admin setting: 30, 90, 180, or 365 days. Default 90. |
| Dedup copy of the question | Stop duplicate replies when Meta retries | `whatsapp_message_dedup` | Same period |
| Admin login email | Operate Tina Admin | Supabase Auth, `admin_profiles` | Until an admin removes access |
| School documents and embeddings | Answer from indexed text | `documents`, `chunks`, bucket `tis-ass` | Kept. Restricted documents are not sent to the model. |
| Question text and excerpts | Produce the reply | OpenAI | Provider setting. Phone number is not in the prompt. |

Deletion in Supabase does not remove the parent’s WhatsApp chat, Meta’s copy, or Supabase backups.

## Providers

| Provider | Role in the chain | Location known |
|---|---|---|
| Meta WhatsApp | Transport of the message and phone number | External — confirm in Meta’s terms |
| Railway | Webhook process | Amsterdam |
| OpenAI | Generates the reply from the question and excerpts | External — confirm retention and training |
| Supabase | Database and file storage | Tokyo (`ap-northeast-1`) |
| Vercel | Tina Admin website | External |
| Google | Drive folder used as a document source | External |

Whether each provider is an entrusted party or a separate controller is for counsel.

## Access

- Parents meet Tina only on WhatsApp.
- Tina Admin is invitation-only. An active admin sends the invitation. There is no public signup path that succeeds without one.
- Conversation rows are readable by an active admin. Anonymous access to the session view was closed on 9 October 2026.
- A parent’s rows can be exported or deleted from Privacy in Tina Admin.
- The first stored reply for a phone number includes a link to the privacy notice when `PRIVACY_NOTICE_URL` is set on the WhatsApp service.

## Open questions

Listed in the audit. They are not answered here: household use versus a business operator, foreign handling, incidental sensitive information in a parent’s message, and whether portal or Drive indexing needs the school’s authority.
