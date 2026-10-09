"""Retention purge, one-parent deletion, and the first-contact privacy line."""

from __future__ import annotations

import logging
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


def public_notice_html(settings: Settings | None = None) -> str:
    """Public notice for parents. Defaults if the config row cannot be read."""
    days = 90
    contact = ""
    try:
        settings = settings or get_settings()
        row = (
            make_supabase(settings)
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

    request_line = (
        f"To ask for a copy, a correction, or earlier deletion, email {_html_escape(contact)}."
        if contact
        else "To ask for a copy, a correction, or earlier deletion, contact the parent who operates Tina."
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>How Tina handles information</title>
  <style>
    body {{ font-family: Georgia, serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #1c1917; }}
    h1 {{ font-size: 1.6rem; }}
    p, li {{ font-size: 1rem; }}
  </style>
</head>
<body>
  <p>Privacy notice · {NOTICE_VERSION}</p>
  <h1>How Tina handles information</h1>
  <p>Tina is an independent AI-powered information assistant created by a parent to help families navigate everyday school life.</p>
  <p>Tina is not affiliated with, endorsed by, or operated by Tokyo International School.</p>
  <p>AI-generated responses may contain inaccuracies. For official information, please contact TIS directly.</p>
  <p>Please avoid sharing sensitive personal information about students, families, or staff.</p>
  <h2>What is stored</h2>
  <p>When you message Tina on WhatsApp, Tina stores your phone number, your message, Tina’s reply, the language, the time, and the titles of documents used in the answer.</p>
  <h2>Why</h2>
  <p>To answer the question, and to review questions Tina could not answer from the documents.</p>
  <h2>Who else handles it</h2>
  <ul>
    <li>Meta (WhatsApp) carries the phone number and the message.</li>
    <li>Railway hosts the webhook in Amsterdam and may keep application logs.</li>
    <li>OpenAI receives the question and short document excerpts. The phone number is not sent to the model.</li>
    <li>Supabase, in Tokyo, stores the conversation and the knowledge base.</li>
    <li>Vercel hosts the admin site.</li>
    <li>Google Drive is a source of documents the operator chooses to index.</li>
  </ul>
  <h2>How long</h2>
  <p>Conversation records in Tina’s database are deleted {days} days after the message. Deleting them here does not remove the chat on your phone, Meta’s copy, or rows still inside Supabase’s backup window.</p>
  <h2>Your request</h2>
  <p>{request_line}</p>
  <p>Tina has no child accounts. Do not send information about other children.</p>
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
