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
    body {{ margin: 0; background: #e6e6e6; color: #1c1917; font-family: Georgia, serif; line-height: 1.5; }}
    nav {{ position: sticky; top: 0; background: #000; padding: 0.75rem 1rem; }}
    nav a {{ color: #fff; margin-right: 1rem; font-family: system-ui, sans-serif; font-size: 0.9rem; }}
    main {{ max-width: 40rem; margin: 0 auto; padding: 2rem 1rem 3rem; }}
    h1 {{ font-size: 1.6rem; }}
    h2 {{ scroll-margin-top: 3rem; }}
  </style>
</head>
<body>
  <nav>
    <a href="#about">About</a>
    <a href="#stored">What is stored</a>
    <a href="#not-stored">What we don't store</a>
    <a href="#safety">Safety</a>
    <a href="#built">How it is built</a>
    <a href="#knowledge">Knowledge</a>
  </nav>
  <main>
    <p>Privacy notice · {NOTICE_VERSION}</p>
    <h1>How Tina handles information</h1>
    <h2 id="about">About this project</h2>
    <p>Tina is an independent assistant a parent at Tokyo International School set up so other parents can find everyday school information more easily. It is a non-commercial project: there is no fee, no advertising, and information is not sold.</p>
    <p>Tina is not affiliated with, endorsed by, or operated by Tokyo International School. The school has not commissioned this assistant.</p>
    <p>Answers are generated and can be wrong. For official information, contact Tokyo International School directly.</p>
    <h2 id="stored">What is stored</h2>
    <p>When you message Tina on WhatsApp, Tina stores your phone number, your message, Tina’s reply, the language, the time, and the titles of documents used in the answer.</p>
    <p>Conversation records are deleted {days} days after the message. That does not remove the chat on your phone, Meta’s copy, or rows still inside a backup window. School documents and knowledge articles are kept.</p>
    <h2 id="not-stored">What we don't store</h2>
    <p>Tina does not keep student records: no grades, report cards, medical files, or a named child’s school account. Knowledge is general school information. Child names are removed from weekly mail before it is stored. Your phone number is not sent to the model that writes the reply.</p>
    <h2 id="safety">How we limit access</h2>
    <p>Only invited staff can open Tina Admin. Conversation records are not readable by the public. WhatsApp checks Meta’s signature. Restricted documents are not sent to the model. An admin can export or delete the stored rows for one phone number. This page is not a certification.</p>
    <h2 id="built">How it is built</h2>
    <ul>
      <li>Meta (WhatsApp) carries the phone number and the message.</li>
      <li>Railway, in Amsterdam, runs the webhook.</li>
      <li>OpenAI writes the reply from the question and short excerpts. The phone number is not part of that request.</li>
      <li>Supabase, in Tokyo, stores the conversation and the searchable knowledge base.</li>
      <li>Vercel hosts the admin site.</li>
      <li>Google Drive is where documents are placed before they are indexed.</li>
    </ul>
    <p>Each company handles its own slice under that company’s terms.</p>
    <h2 id="knowledge">Knowledge</h2>
    <p>Knowledge is general school information, not a file about a student. Google Drive holds the source documents. Supabase holds the copy used to search and answer. Tina Admin holds knowledge articles staff write, which are added to the same search store.</p>
    <h2>Your request</h2>
    <p>{request_line}</p>
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
