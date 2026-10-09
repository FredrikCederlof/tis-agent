"""Retention purge, one-parent deletion, and the first-contact privacy line."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from tis_agent.clients import make_supabase
from tis_agent.config import Settings, get_settings

logger = logging.getLogger("tis_agent.privacy")

NOTICE_VERSION = "2026-10-09"
ALLOWED_RETENTION_DAYS = (30, 90, 180, 365)


def normalize_phone(raw: str) -> str:
    return "".join(ch for ch in raw if ch.isdigit())


def phone_variants(raw: str) -> list[str]:
    digits = normalize_phone(raw)
    variants: list[str] = []
    for value in (raw.strip(), digits, f"+{digits}" if digits else ""):
        if value and value not in variants:
            variants.append(value)
    return variants


def _html_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


_PAGE_TAGS = {"p", "h2", "h3", "ul", "ol", "li", "a", "strong", "em", "b", "i", "br", "blockquote"}


def sanitize_page_html(html: str) -> str:
    """Keep the tags the admin editor produces. Drop scripts and unexpected markup."""
    cleaned = re.sub(r"(?is)<!--.*?-->", "", html)
    cleaned = re.sub(r"(?is)<script.*?>.*?</script>", "", cleaned)
    cleaned = re.sub(r"(?is)<style.*?>.*?</style>", "", cleaned)

    def repl(match: re.Match[str]) -> str:
        name = match.group(1).lower()
        if name not in _PAGE_TAGS:
            return ""
        if match.group(0).startswith("</"):
            return "" if name == "br" else f"</{name}>"
        if name == "br":
            return "<br>"
        if name == "a":
            href_match = re.search(
                r"""href\s*=\s*(?:"([^"]*)"|'([^']*)')""",
                match.group(2),
                re.I,
            )
            href = ((href_match.group(1) or href_match.group(2) or "") if href_match else "").strip()
            if href.lower().startswith(("http://", "https://", "mailto:", "/")) and "javascript:" not in href.lower():
                return f'<a href="{_html_escape(href)}">'
            return "<a>"
        return f"<{name}>"

    return re.sub(r"</?([a-zA-Z0-9]+)([^>]*)>", repl, cleaned)


def _apply_page_tokens(html: str, days: int, email: str) -> str:
    return html.replace("{retention_days}", str(days)).replace(
        "{privacy_contact_email}", _html_escape(email)
    )


def _published_page(settings: Settings, slug: str) -> dict[str, Any] | None:
    try:
        row = (
            make_supabase(settings)
            .table("content_pages")
            .select("title,body_html")
            .eq("slug", slug)
            .eq("published", True)
            .limit(1)
            .execute()
        )
    except Exception:
        logger.exception("Could not load public page %s", slug)
        return None
    data = (row.data or [None])[0]
    if not data or not str(data.get("body_html") or "").strip():
        return None
    return data


def _render_stored_page(title: str, body_html: str, days: int, email: str) -> str:
    safe_title = _html_escape(title or "How Tina handles information")
    body = _apply_page_tokens(sanitize_page_html(body_html), days, email)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_title}</title>
  <style>
    body {{ margin: 0; background: #e6e6e6; color: #1c1917; font-family: Georgia, serif; line-height: 1.5; }}
    main {{ max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.5rem 3rem; }}
    h1 {{ font-size: 1.6rem; }}
    h2 {{ scroll-margin-top: 1.5rem; }}
  </style>
</head>
<body>
  <main>
    <h1>{safe_title}</h1>
    {body}
  </main>
</body>
</html>
"""


def public_notice_html(settings: Settings | None = None) -> str:
    """Public notice for parents. Defaults if the config row cannot be read."""
    days = 90
    contact = ""
    loaded_settings: Settings | None = settings
    try:
        loaded_settings = settings or get_settings()
        row = (
            make_supabase(loaded_settings)
            .table("agent_config")
            .select("retention_days, privacy_contact_email")
            .eq("id", 1)
            .single()
            .execute()
        )
        data = row.data or {}
        candidate = int(data.get("retention_days") or 90)
        if candidate in ALLOWED_RETENTION_DAYS:
            days = candidate
        contact = str(data.get("privacy_contact_email") or "").strip()
    except Exception:
        logger.exception("Could not load privacy notice settings")

    contact_email = contact or "fredrik@insightworks.se"
    if loaded_settings is not None:
        page = _published_page(loaded_settings, "privacy")
        if page:
            return _render_stored_page(
                str(page.get("title") or ""),
                str(page.get("body_html") or ""),
                days,
                contact_email,
            )

    escaped_email = _html_escape(contact_email)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>How Tina handles information</title>
  <style>
    body {{ margin: 0; background: #e6e6e6; color: #1c1917; font-family: Georgia, serif; line-height: 1.5; }}
    main {{ max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.5rem 3rem; }}
    h1 {{ font-size: 1.6rem; }}
    h2 {{ scroll-margin-top: 1.5rem; }}
  </style>
</head>
<body>
  <main>
    <p>Privacy notice · {NOTICE_VERSION}</p>
    <h1>How Tina handles information</h1>
    <h2>About this project</h2>
    <p>Tina is an independent assistant a parent at Tokyo International School set up so other parents can find everyday school information more easily. It is a non-commercial project: there is no fee, no advertising, and information is not sold.</p>
    <p>Tina is not affiliated with, endorsed by, or operated by Tokyo International School. The school has not commissioned this assistant.</p>
    <p>Answers are generated and can be wrong. For official information, contact Tokyo International School directly.</p>
    <p>This page describes how Tina works. It is not a legal opinion, and it is not a statement that Tina meets a particular law.</p>
    <h2>Privacy notice</h2>
    <p>Questions about this notice go to Fredrik Sterner Cederlöf at <a href="mailto:{escaped_email}">{escaped_email}</a>.</p>
    <p>Using Tina is optional. You start by sending a WhatsApp message. The first reply to a new number includes a link to this notice. That first message is received and answered before the link is shown. If you do not want Tina to keep the conversation, stop messaging, or ask for deletion.</p>
    <p>When you message Tina, Tina stores your phone number, your message, Tina’s reply, the language, the time, and the titles of documents used in the answer. A short copy of the question is also kept so a retried WhatsApp delivery is not answered twice.</p>
    <h2>How we use your information</h2>
    <ul>
      <li>Receive a WhatsApp question and reply to it.</li>
      <li>Keep recent messages in the same chat so a follow-up can be understood.</li>
      <li>Ignore a duplicate delivery of the same message.</li>
      <li>Let an invited administrator review a question Tina could not answer.</li>
      <li>Let an administrator save a reviewed, general article into the knowledge base.</li>
      <li>Notify staff of a question. In that notification the phone number is masked.</li>
      <li>Respond to a request for a copy, a correction, or deletion, and look into a technical problem.</li>
    </ul>
    <p>Information is not sold and is not used for advertising. Improving Tina means a person writes a general article. The raw chat is not kept for that purpose beyond the retention period below.</p>
    <h2>Children</h2>
    <p>Tina does not keep student profiles, grades, medical records, or a named child’s school account. The material used to answer is general school information.</p>
    <p>A message you send can still name a child or include other personal details. That message is stored as you sent it. Please do not share information about children or other people unless you need to. Weekly school mail is cleaned before it is added, and child names are removed from that mail.</p>
    <h2>Data retention</h2>
    <p>Conversation records are kept for {days} days, then deleted from Tina’s active database. School documents and knowledge articles stay. The chat on your phone, copies held by WhatsApp or other providers, and temporary backups can remain for a different period.</p>
    <h2>Who can see conversations</h2>
    <p>Tina Admin is only for people an administrator has invited. Conversation records are not public. Invited staff can read them in order to handle questions Tina could not answer. Some documents are marked so they stay in storage and are left out of answers.</p>
    <h2>Your request</h2>
    <p>You can ask for a copy, a correction, or deletion of the information stored for your WhatsApp number. Contact Fredrik Sterner Cederlöf at <a href="mailto:{escaped_email}">{escaped_email}</a>. We may need to confirm that you control that phone number before completing the request. Deleting the rows in Tina’s database does not delete the chat on your phone, copies held by other providers, or temporary backups.</p>
    <h2>Where information is handled</h2>
    <p>Some of this happens outside Japan.</p>
    <ul>
      <li>Meta (WhatsApp) carries the phone number and the message.</li>
      <li>A service in Singapore receives the message and sends the reply.</li>
      <li>OpenAI writes the reply from the question, recent messages in the same chat, and short excerpts from school documents. The phone number is not included.</li>
      <li>Supabase, in Tokyo, stores the conversation and the searchable knowledge base.</li>
      <li>Vercel hosts this website.</li>
      <li>Google Drive holds the source documents that are chosen for indexing.</li>
      <li>Slack can show staff the text of a question. The phone number in that notice is masked.</li>
    </ul>
    <p>Each company handles its own part under that company’s terms. This page does not describe a completed legal arrangement for transfers outside Japan.</p>
    <h2>Knowledge</h2>
    <p>Answers come from general school information, not from a file about a student. Google Drive holds the source documents. Supabase holds the copy used to search and answer. Tina Admin holds knowledge articles a person writes and saves. An article can start from a question Tina could not answer. The person reviews it and is expected to keep it general before it is saved. A saved article stays after the conversation itself is deleted.</p>
  </main>
</body>
</html>
"""


def first_contact_line(notice_url: str) -> str:
    url = notice_url.strip()
    if not url:
        return ""
    return (
        "Tina is an independent parent assistant, not a service of Tokyo International School. "
        f"Privacy notice ({NOTICE_VERSION}): {url}"
    )


def has_prior_session(settings: Settings, wa_from: str) -> bool:
    """True when this number already has a stored session, or the check failed."""
    try:
        existing = (
            make_supabase(settings)
            .table("chat_sessions")
            .select("id")
            .eq("wa_from", wa_from)
            .limit(1)
            .execute()
        )
    except Exception:
        logger.exception("Could not check whether a privacy notice was already sent")
        return True
    return bool(existing.data)


def _cutoff(days: int) -> str:
    if days not in ALLOWED_RETENTION_DAYS:
        raise ValueError(f"retention_days must be one of {ALLOWED_RETENTION_DAYS}")
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _count_lt(sb: Any, table: str, column: str, cutoff: str) -> int:
    result = (
        sb.table(table)
        .select("*", count="exact", head=True)
        .lt(column, cutoff)
        .execute()
    )
    return int(result.count or 0)


def _record_event(
    sb: Any,
    *,
    event_type: str,
    actor: str,
    retention_days: int | None,
    sessions_deleted: int,
    dedup_deleted: int,
    detail: dict[str, Any],
) -> None:
    sb.table("privacy_events").insert(
        {
            "event_type": event_type,
            "actor": actor,
            "retention_days": retention_days,
            "sessions_deleted": sessions_deleted,
            "dedup_deleted": dedup_deleted,
            "detail": detail,
        }
    ).execute()


def load_retention_days(settings: Settings | None = None) -> int:
    settings = settings or get_settings()
    row = (
        make_supabase(settings)
        .table("agent_config")
        .select("retention_days")
        .eq("id", 1)
        .single()
        .execute()
    )
    days = int((row.data or {}).get("retention_days") or 90)
    if days not in ALLOWED_RETENTION_DAYS:
        raise ValueError(f"retention_days must be one of {ALLOWED_RETENTION_DAYS}")
    return days


def purge_expired(
    *,
    dry_run: bool = False,
    actor: str = "cron",
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Delete conversation rows older than the configured retention. Documents stay."""
    settings = settings or get_settings()
    sb = make_supabase(settings)
    days = load_retention_days(settings)
    cutoff = _cutoff(days)
    session_count = _count_lt(sb, "chat_sessions", "last_message_at", cutoff)
    dedup_count = _count_lt(sb, "whatsapp_message_dedup", "processed_at", cutoff)

    if dry_run:
        return {
            "dry_run": True,
            "retention_days": days,
            "sessions_due": session_count,
            "dedup_due": dedup_count,
        }

    if session_count:
        due = (
            sb.table("chat_sessions")
            .select("id")
            .lt("last_message_at", cutoff)
            .execute()
        )
        session_ids = [row["id"] for row in (due.data or [])]
        for start in range(0, len(session_ids), 100):
            batch = session_ids[start : start + 100]
            sb.table("admin_replies").delete().in_("session_id", batch).execute()
        sb.table("chat_sessions").delete().lt("last_message_at", cutoff).execute()

    if dedup_count:
        sb.table("whatsapp_message_dedup").delete().lt("processed_at", cutoff).execute()

    _record_event(
        sb,
        event_type="purge",
        actor=actor,
        retention_days=days,
        sessions_deleted=session_count,
        dedup_deleted=dedup_count,
        detail={},
    )
    return {
        "dry_run": False,
        "retention_days": days,
        "sessions_deleted": session_count,
        "dedup_deleted": dedup_count,
    }


def _rows_for_phone(sb: Any, table: str, variants: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for phone in variants:
        result = sb.table(table).select("*").eq("wa_from", phone).execute()
        rows.extend(result.data or [])
    return rows


def export_subject(phone: str, *, settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    sb = make_supabase(settings)
    variants = phone_variants(phone)
    return {
        "sessions": _rows_for_phone(sb, "chat_sessions", variants),
        "interactions": _rows_for_phone(sb, "interactions", variants),
        "dedup": _rows_for_phone(sb, "whatsapp_message_dedup", variants),
    }


def delete_subject(
    phone: str,
    *,
    actor: str,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    sb = make_supabase(settings)
    variants = phone_variants(phone)
    sessions = _rows_for_phone(sb, "chat_sessions", variants)
    session_ids = [row["id"] for row in sessions if row.get("id")]
    dedup_count = len(_rows_for_phone(sb, "whatsapp_message_dedup", variants))

    for start in range(0, len(session_ids), 100):
        batch = session_ids[start : start + 100]
        sb.table("admin_replies").delete().in_("session_id", batch).execute()
    for value in variants:
        sb.table("chat_sessions").delete().eq("wa_from", value).execute()
        sb.table("whatsapp_message_dedup").delete().eq("wa_from", value).execute()

    digits = normalize_phone(phone)
    _record_event(
        sb,
        event_type="subject_delete",
        actor=actor,
        retention_days=None,
        sessions_deleted=len(sessions),
        dedup_deleted=dedup_count,
        detail={"phone_last4": digits[-4:] if digits else ""},
    )
    return {
        "sessions_deleted": len(sessions),
        "dedup_deleted": dedup_count,
    }
