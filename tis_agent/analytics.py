"""Log WhatsApp conversations and classify answer outcomes (Milestone 4)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from tis_agent.clients import make_supabase
from tis_agent.config import Settings, get_settings

logger = logging.getLogger("tis_agent.analytics")

SESSION_GAP_MINUTES = 10
LOW_CONFIDENCE_THRESHOLD = 0.40

OUTCOME_SUCCESS = "success"
OUTCOME_NO_EVIDENCE = "no_evidence"
OUTCOME_LOW_CONFIDENCE = "low_confidence"
OUTCOME_FIXED_ANSWER = "fixed_answer"
OUTCOME_ERROR = "error"


def classify_outcome(
    *,
    evidence_count: int,
    top_similarity: float | None,
    had_error: bool = False,
    is_fixed_answer: bool = False,
    similarity_threshold: float = LOW_CONFIDENCE_THRESHOLD,
) -> str:
    if had_error:
        return OUTCOME_ERROR
    if is_fixed_answer:
        return OUTCOME_FIXED_ANSWER
    if evidence_count == 0:
        return OUTCOME_NO_EVIDENCE
    if top_similarity is None or top_similarity < similarity_threshold:
        return OUTCOME_LOW_CONFIDENCE
    return OUTCOME_SUCCESS


def resolve_session_id(
    settings: Settings,
    wa_from: str,
    *,
    language: str | None = None,
) -> str:
    """Return active session id, or start a new session after 10 min idle."""
    sb = make_supabase(settings)
    cutoff = (
        datetime.now(timezone.utc) - timedelta(minutes=SESSION_GAP_MINUTES)
    ).isoformat()

    existing = (
        sb.table("chat_sessions")
        .select("id, message_count, primary_language")
        .eq("wa_from", wa_from)
        .gte("last_message_at", cutoff)
        .order("last_message_at", desc=True)
        .limit(1)
        .execute()
    )

    rows = existing.data or []
    now_iso = datetime.now(timezone.utc).isoformat()

    if rows:
        session = rows[0]
        session_id = session["id"]
        update: dict[str, Any] = {
            "last_message_at": now_iso,
            "message_count": int(session.get("message_count") or 0) + 1,
        }
        if language and not session.get("primary_language"):
            update["primary_language"] = language
        sb.table("chat_sessions").update(update).eq("id", session_id).execute()
        return session_id

    insert = {
        "wa_from": wa_from,
        "started_at": now_iso,
        "last_message_at": now_iso,
        "message_count": 1,
    }
    if language:
        insert["primary_language"] = language
    created = sb.table("chat_sessions").insert(insert).execute()
    return created.data[0]["id"]


def claim_whatsapp_message(
    wa_message_id: str,
    wa_from: str,
    question: str,
    *,
    settings: Settings | None = None,
) -> bool:
    """Return True if this inbound message should be processed (first time seen)."""
    settings = settings or get_settings()
    try:
        sb = make_supabase(settings)
        sb.table("whatsapp_message_dedup").insert(
            {
                "wa_message_id": wa_message_id,
                "wa_from": wa_from,
                "question": question,
            }
        ).execute()
        return True
    except Exception as exc:
        err = str(exc).lower()
        if "duplicate" in err or "23505" in err or "unique" in err:
            logger.info("Skipping duplicate WhatsApp message %s", wa_message_id)
            return False
        logger.exception("Dedup claim failed for %s; processing anyway", wa_message_id)
        return True


def log_interaction(
    *,
    session_id: str,
    wa_from: str,
    question: str,
    reply: str | None,
    language: str,
    outcome: str,
    evidence_count: int = 0,
    top_similarity: float | None = None,
    document_titles: list[str] | None = None,
    wa_message_id: str | None = None,
    channel: str = "whatsapp",
    settings: Settings | None = None,
) -> None:
    """Persist one parent question + Tina reply. Failures are logged, not raised."""
    settings = settings or get_settings()
    row = {
        "session_id": session_id,
        "wa_from": wa_from,
        "question": question,
        "reply": reply,
        "language": language,
        "outcome": outcome,
        "evidence_count": evidence_count,
        "top_similarity": top_similarity,
        "document_titles": document_titles or [],
        "channel": channel,
    }
    if wa_message_id:
        row["wa_message_id"] = wa_message_id

    try:
        sb = make_supabase(settings)
        sb.table("interactions").insert(row).execute()
    except Exception:
        logger.exception("Failed to log interaction for session %s", session_id)
