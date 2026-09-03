"""Human in the loop: an admin answers a parent through the same WhatsApp thread.

Extends the existing escalation flow (`interactions.reviewed_at`) instead of adding a
parallel queue. Every outbound admin message is stored in `admin_replies`, so the
lifecycle inbound message -> unanswered question -> human reply -> Knowledge Hub entry
stays traceable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from uuid import UUID

from tis_agent.clients import make_supabase
from tis_agent.config import Settings, get_settings

logger = logging.getLogger("tis_agent.human_reply")

# Meta lets a business send free-form text for 24h after the last user message.
REPLY_WINDOW_HOURS = 24
MAX_REPLY_CHARS = 4096


class ReplyWindowClosed(Exception):
    """The 24-hour WhatsApp customer-service window has expired."""


class ReplySendFailed(Exception):
    """WhatsApp rejected the message; the question stays unanswered."""


@dataclass
class ReplyWindow:
    is_open: bool
    last_inbound_at: datetime | None
    expires_at: datetime | None
    remaining_seconds: int
    label: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "open": self.is_open,
            "last_inbound_at": self.last_inbound_at.isoformat() if self.last_inbound_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "remaining_seconds": self.remaining_seconds,
            "label": self.label,
        }


def parse_iso(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        stamp = value
    else:
        text = str(value).replace("Z", "+00:00")
        try:
            stamp = datetime.fromisoformat(text)
        except ValueError:
            return None
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)


def format_remaining(seconds: int) -> str:
    if seconds <= 0:
        return "Reply window expired"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours >= 1:
        return f"Reply window open — {hours}h remaining"
    if minutes >= 1:
        return f"Reply window open — {minutes}m remaining"
    return "Reply window open — under a minute remaining"


def reply_window(last_inbound_at: Any, *, now: datetime | None = None) -> ReplyWindow:
    """Free-form replies are allowed for 24h after the parent's last message."""
    stamp = parse_iso(last_inbound_at)
    if stamp is None:
        return ReplyWindow(
            is_open=False,
            last_inbound_at=None,
            expires_at=None,
            remaining_seconds=0,
            label="No inbound message — reply window unknown",
        )
    moment = now or datetime.now(timezone.utc)
    expires_at = stamp + timedelta(hours=REPLY_WINDOW_HOURS)
    remaining = int((expires_at - moment).total_seconds())
    remaining = max(remaining, 0)
    return ReplyWindow(
        is_open=remaining > 0,
        last_inbound_at=stamp,
        expires_at=expires_at,
        remaining_seconds=remaining,
        label=format_remaining(remaining),
    )


@dataclass
class ReplyRequest:
    interaction_id: str
    body: str
    sent_by: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def normalize_reply_payload(payload: dict[str, Any]) -> ReplyRequest:
    interaction_id = str((payload or {}).get("interaction_id") or "").strip()
    if not interaction_id:
        raise ValueError("interaction_id is required")
    UUID(interaction_id)
    body = str((payload or {}).get("body") or "").strip()
    if not body:
        raise ValueError("body is required")
    if len(body) > MAX_REPLY_CHARS:
        raise ValueError(f"body must be {MAX_REPLY_CHARS} characters or fewer")
    sent_by = str((payload or {}).get("sent_by") or "").strip() or None
    return ReplyRequest(interaction_id=interaction_id, body=body, sent_by=sent_by)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_interaction(client: Any, interaction_id: str) -> dict[str, Any]:
    response = (
        client.table("interactions")
        .select("id, session_id, wa_from, wa_message_id, question, outcome, reviewed_at")
        .eq("id", interaction_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise KeyError(f"interaction not found: {interaction_id}")
    return rows[0]


def _last_inbound_at(client: Any, wa_from: str) -> Any:
    """Newest logged question for this parent — proxy for their last inbound message."""
    response = (
        client.table("interactions")
        .select("created_at")
        .eq("wa_from", wa_from)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0].get("created_at") if rows else None


def session_reply_window(
    session_id: str,
    *,
    settings: Settings | None = None,
    client: Any | None = None,
    now: datetime | None = None,
) -> ReplyWindow:
    """Reply window for a chat session, based on its parent's last message."""
    settings = settings or get_settings()
    sb = client or make_supabase(settings)
    response = (
        sb.table("interactions")
        .select("wa_from, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return reply_window(None, now=now)
    return reply_window(_last_inbound_at(sb, rows[0]["wa_from"]), now=now)


def send_human_reply(
    payload: dict[str, Any],
    *,
    settings: Settings | None = None,
    client: Any | None = None,
    send: Callable[[str, str], str | None] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Send an admin answer to the parent and mark the question answered.

    A failed send is recorded and raises, so the question keeps requiring action.
    """
    request = normalize_reply_payload(payload)
    settings = settings or get_settings()
    sb = client or make_supabase(settings)
    interaction = _load_interaction(sb, request.interaction_id)
    wa_from = str(interaction.get("wa_from") or "")
    session_id = str(interaction.get("session_id") or "")
    if not wa_from or not session_id:
        raise KeyError(f"interaction is missing WhatsApp identifiers: {request.interaction_id}")

    window = reply_window(_last_inbound_at(sb, wa_from), now=now)
    if not window.is_open:
        raise ReplyWindowClosed(
            "The 24-hour WhatsApp reply window has expired for this parent, "
            "so a free-form message cannot be sent."
        )

    sender = send or _default_sender()
    try:
        wa_message_id = sender(wa_from, request.body)
    except Exception as exc:
        logger.exception("Admin reply send failed for interaction %s", request.interaction_id)
        _record_reply(
            sb,
            session_id=session_id,
            interaction_id=request.interaction_id,
            wa_from=wa_from,
            body=request.body,
            sent_by=request.sent_by,
            status="failed",
            error=str(exc)[:500],
            wa_message_id=None,
        )
        raise ReplySendFailed(str(exc)) from exc

    reply_row = _record_reply(
        sb,
        session_id=session_id,
        interaction_id=request.interaction_id,
        wa_from=wa_from,
        body=request.body,
        sent_by=request.sent_by,
        status="sent",
        error=None,
        wa_message_id=wa_message_id,
    )

    answered_at = _now_iso()
    update: dict[str, Any] = {
        "human_replied_at": answered_at,
        "human_replied_by": request.sent_by,
    }
    if not interaction.get("reviewed_at"):
        update["reviewed_at"] = answered_at
        update["reviewed_by"] = request.sent_by or "human-reply"
    sb.table("interactions").update(update).eq("id", request.interaction_id).execute()

    return {
        "status": "sent",
        "interaction_id": request.interaction_id,
        "session_id": session_id,
        "wa_from": wa_from,
        "question": interaction.get("question"),
        "reply": request.body,
        "reply_id": (reply_row or {}).get("id"),
        "wa_message_id": wa_message_id,
        "answered_at": answered_at,
        "window": window.as_dict(),
    }


def _record_reply(
    client: Any,
    *,
    session_id: str,
    interaction_id: str,
    wa_from: str,
    body: str,
    sent_by: str | None,
    status: str,
    error: str | None,
    wa_message_id: str | None,
) -> dict[str, Any] | None:
    row = {
        "session_id": session_id,
        "interaction_id": interaction_id,
        "wa_from": wa_from,
        "body": body,
        "status": status,
        "error": error,
        "sent_by": sent_by,
        "wa_message_id": wa_message_id,
    }
    try:
        inserted = client.table("admin_replies").insert(row).execute()
        rows = inserted.data or []
        return rows[0] if rows else None
    except Exception:
        logger.exception("Failed to record admin reply for interaction %s", interaction_id)
        return None


def _default_sender() -> Callable[[str, str], str | None]:
    from tis_agent.whatsapp import send_text
    from tis_agent.whatsapp_config import get_whatsapp_settings

    wa_settings = get_whatsapp_settings()

    def _send(to: str, body: str) -> str | None:
        return send_text(wa_settings, to, body)

    return _send
