"""Fire-and-forget Slack Incoming Webhook posts for Tina WhatsApp Q&A."""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# Keep in sync with push_notify.GAP_OUTCOMES / unanswered_interactions.
GAP_OUTCOMES = frozenset({"no_evidence", "low_confidence"})

# Remind once when remaining time first enters each band (tightest wins per scan).
REMINDER_MILESTONES: tuple[tuple[str, int], ...] = (
    ("4h", 4 * 3600),
    ("1h", 1 * 3600),
)

SCHOOL_TZ = ZoneInfo("Asia/Tokyo")
REPLY_TRUNCATE_CHARS = 2500

_ENV_PARENT = "SLACK_WEBHOOK_PARENT_QUESTIONS"
_ENV_NEEDS = "SLACK_WEBHOOK_NEEDS_ATTENTION"
# Names already set on the Railway WhatsApp service.
_ENV_PARENT_ALIASES = ("SLACK_WEBHOOK_URL",)
_ENV_NEEDS_ALIASES = ("SLACK_NEEDS_ATTENTION_WEBHOOK_URL",)

_missing_logged: set[str] = set()


def _format_remaining(seconds: int) -> str:
    """Local copy of human_reply.format_remaining — avoid import side effects in tests."""
    if seconds <= 0:
        return "24h reply window closed"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours >= 1:
        return f"24h window — {hours}h left"
    if minutes >= 1:
        return f"24h window — {minutes}m left"
    return "24h window — under a minute left"


def mask_wa_from(wa_from: str | None) -> str:
    """Masked parent id, e.g. Parent ·••1234 — last four digits only."""
    digits = re.sub(r"\D", "", wa_from or "")
    if len(digits) >= 4:
        return f"Parent ·••{digits[-4:]}"
    if digits:
        return f"Parent ·••{digits}"
    return "Parent"


def humanize_outcome(outcome: str | None) -> str:
    """Staff-facing outcome copy (confidence / gap language, not raw codes)."""
    key = (outcome or "").strip().lower()
    return {
        "success": "High confidence",
        "low_confidence": "Low confidence — needs attention",
        "no_evidence": "No matching school info — needs attention",
        "error": "Tina error",
        "manual": "Manually flagged",
    }.get(key, (outcome or "Unknown").replace("_", " ").strip().capitalize() or "Unknown")


def admin_base_url() -> str:
    base = (os.environ.get("TINA_ADMIN_URL") or "").strip().rstrip("/")
    if not base:
        base = "https://admin-lac-zeta.vercel.app"
    return base


def admin_deep_link(
    *,
    session_id: str | None = None,
    needs_attention: bool = False,
) -> str:
    """Deep link into Tina Admin chat thread, or inbox when no session."""
    base = admin_base_url()
    sid = (session_id or "").strip()
    if sid:
        return f"{base}/chats/{sid}"
    if needs_attention:
        return f"{base}/inbox"
    return f"{base}/chats"


def _format_when(when: datetime) -> str:
    """Readable Asia/Tokyo stamp, e.g. 2026/10/02 12:00 JST."""
    local = when.astimezone(SCHOOL_TZ)
    return local.strftime("%Y/%m/%d %H:%M JST")


def should_notify_needs_attention(outcome: str | None) -> bool:
    return (outcome or "") in GAP_OUTCOMES


def next_reminder_milestone(
    remaining_seconds: int, already_sent: set[str] | frozenset[str]
) -> str | None:
    """Return the tightest unmet milestone whose threshold remaining has entered."""
    if remaining_seconds <= 0:
        return None
    candidates = [
        (name, threshold)
        for name, threshold in REMINDER_MILESTONES
        if name not in already_sent and remaining_seconds <= threshold
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[1])[0]


def mark_reminder_milestones(sent_milestone: str) -> list[str]:
    """Milestones to record when sending one (include looser bands we skipped past)."""
    thresholds = {name: thr for name, thr in REMINDER_MILESTONES}
    if sent_milestone not in thresholds:
        return [sent_milestone]
    sent_thr = thresholds[sent_milestone]
    return [name for name, thr in REMINDER_MILESTONES if thr >= sent_thr]


def _truncate(text: str, limit: int = REPLY_TRUNCATE_CHARS) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _webhook(*env_names: str) -> str:
    """First non-empty value wins. Canonical name, then Railway aliases."""
    for name in env_names:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def _log_missing_once(env_name: str) -> None:
    if env_name in _missing_logged:
        return
    _missing_logged.add(env_name)
    logger.info("slack_notify_skip reason=not_configured env=%s", env_name)


def _format_expires(expires_at: datetime | None) -> str | None:
    if expires_at is None:
        return None
    return _format_when(expires_at)


def format_slack_payload(
    *,
    title: str,
    question: str,
    reply: str | None,
    wa_from: str | None,
    outcome: str,
    session_id: str | None = None,
    language: str | None = None,
    wa_message_id: str | None = None,
    when: datetime | None = None,
    remaining_seconds: int | None = None,
    expires_at: datetime | None = None,
    extra_meta: list[str] | None = None,
    needs_attention: bool = False,
    deep_link_label: str | None = None,
) -> dict[str, Any]:
    """Build Slack Incoming Webhook body (text + Block Kit).

    ``wa_message_id`` is accepted for callers but never shown (too noisy).
    ``session_id`` is used for the Admin deep link only — not listed as metadata.
    """
    del wa_message_id  # kept in signature for call-site compatibility
    when = when or datetime.now(SCHOOL_TZ)
    when_label = _format_when(when)
    masked = mask_wa_from(wa_from)
    outcome_label = humanize_outcome(outcome)
    reply_text = _truncate(reply or "")
    question_text = question or ""
    link = admin_deep_link(session_id=session_id, needs_attention=needs_attention)
    button_label = (deep_link_label or "Open Message")[:75]

    meta_lines = [
        f"*When:* {when_label}",
        f"*From:* {masked}",
        f"*Outcome:* {outcome_label}",
    ]
    if language:
        meta_lines.append(f"*Language:* `{language}`")
    if remaining_seconds is not None:
        meta_lines.append(f"*Reply window:* {_format_remaining(remaining_seconds)}")
    expires_label = _format_expires(expires_at)
    if expires_label:
        meta_lines.append(f"*Window closes:* {expires_label}")
    if extra_meta:
        meta_lines.extend(extra_meta)

    fallback = (
        f"{title}\n"
        f"Q: {question_text}\n"
        f"A: {reply_text}\n"
        f"{masked} · {outcome_label} · {when_label}\n"
        f"{link}"
    )
    if remaining_seconds is not None:
        fallback += f"\n{_format_remaining(remaining_seconds)}"

    blocks: list[dict[str, Any]] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": title[:150], "emoji": True},
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Question*\n{question_text or '_empty_'}",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Tina*\n{reply_text or '_empty_'}",
            },
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": "\n".join(meta_lines)},
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": button_label,
                        "emoji": True,
                    },
                    "url": link,
                    "action_id": "open_tina_admin",
                }
            ],
        },
    ]
    return {"text": fallback, "blocks": blocks}


def _post_webhook(url: str, payload: dict[str, Any], *, label: str) -> None:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        logger.info("slack_notify_ok channel=%s status=%s", label, response.status)


def _post_async(url: str, payload: dict[str, Any], *, label: str, thread_name: str) -> None:
    def _send() -> None:
        try:
            _post_webhook(url, payload, label=label)
        except urllib.error.HTTPError as exc:
            logger.warning("slack_notify_http channel=%s status=%s", label, exc.code)
        except Exception:
            logger.exception("slack_notify_failed channel=%s", label)

    threading.Thread(target=_send, name=thread_name, daemon=True).start()


def notify_parent_question(
    *,
    question: str,
    reply: str | None,
    wa_from: str | None,
    outcome: str,
    session_id: str | None = None,
    language: str | None = None,
    wa_message_id: str | None = None,
) -> None:
    """POST Q&A to #tina-parent-questions. Never raises; runs in a daemon thread."""
    url = _webhook(_ENV_PARENT, *_ENV_PARENT_ALIASES)
    if not url:
        _log_missing_once(_ENV_PARENT)
        return

    payload = format_slack_payload(
        title="Tina parent question",
        question=question,
        reply=reply,
        wa_from=wa_from,
        outcome=outcome,
        session_id=session_id,
        language=language,
        wa_message_id=wa_message_id,
    )
    _post_async(url, payload, label="parent_questions", thread_name="tina-slack-parent")


def notify_needs_attention(
    *,
    question: str,
    reply: str | None,
    wa_from: str | None,
    outcome: str,
    session_id: str | None = None,
    language: str | None = None,
    wa_message_id: str | None = None,
    remaining_seconds: int | None = None,
    expires_at: datetime | None = None,
    force: bool = False,
) -> None:
    """POST to #tina-needs-attention. Never raises; daemon thread.

    By default only gap outcomes post. Pass force=True for manual Admin flags.
    Window metadata is resolved inside the worker so WhatsApp latency is unchanged.
    """
    if not force and not should_notify_needs_attention(outcome):
        return

    url = _webhook(_ENV_NEEDS, *_ENV_NEEDS_ALIASES)
    if not url:
        _log_missing_once(_ENV_NEEDS)
        return

    def _send() -> None:
        try:
            rem = remaining_seconds
            exp = expires_at
            if rem is None and exp is None:
                rem, exp = _window_for_parent(wa_from)
            payload = format_slack_payload(
                title="Needs attention",
                question=question,
                reply=reply,
                wa_from=wa_from,
                outcome=outcome,
                session_id=session_id,
                language=language,
                wa_message_id=wa_message_id,
                remaining_seconds=rem,
                expires_at=exp,
                needs_attention=True,
            )
            _post_webhook(url, payload, label="needs_attention")
        except urllib.error.HTTPError as exc:
            logger.warning(
                "slack_notify_http channel=needs_attention status=%s", exc.code
            )
        except Exception:
            logger.exception("slack_notify_failed channel=needs_attention")

    threading.Thread(target=_send, name="tina-slack-needs", daemon=True).start()


def notify_window_reminder(
    *,
    question: str,
    reply: str | None,
    wa_from: str | None,
    outcome: str,
    milestone: str,
    remaining_seconds: int,
    expires_at: datetime | None = None,
    session_id: str | None = None,
    language: str | None = None,
    wa_message_id: str | None = None,
) -> None:
    """Reminder in #tina-needs-attention before the WhatsApp 24h window closes."""
    url = _webhook(_ENV_NEEDS, *_ENV_NEEDS_ALIASES)
    if not url:
        _log_missing_once(_ENV_NEEDS)
        return

    title = f"Reply window closing — {milestone} left"
    payload = format_slack_payload(
        title=title,
        question=question,
        reply=reply,
        wa_from=wa_from,
        outcome=outcome,
        session_id=session_id,
        language=language,
        wa_message_id=wa_message_id,
        remaining_seconds=remaining_seconds,
        expires_at=expires_at,
        needs_attention=True,
        extra_meta=[f"*Reminder:* `{milestone}` before WhatsApp free-form replies close"],
    )
    _post_async(
        url,
        payload,
        label="needs_attention_reminder",
        thread_name="tina-slack-reminder",
    )


def _window_for_parent(wa_from: str | None) -> tuple[int | None, datetime | None]:
    """Best-effort reply window for Slack metadata. Never raises."""
    if not wa_from:
        return None, None
    try:
        from tis_agent.clients import make_supabase
        from tis_agent.config import get_settings
        from tis_agent.human_reply import reply_window

        sb = make_supabase(get_settings())
        response = (
            sb.table("interactions")
            .select("created_at")
            .eq("wa_from", wa_from)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        last = rows[0].get("created_at") if rows else None
        window = reply_window(last)
        return window.remaining_seconds, window.expires_at
    except Exception:
        logger.exception("slack window lookup failed")
        return None, None


def notify_slack_interaction(
    *,
    wa_from: str | None,
    question: str,
    reply: str | None,
    outcome: str,
    language: str | None = None,
    session_id: str | None = None,
    wa_message_id: str | None = None,
) -> None:
    """Always notify parent-questions; also needs-attention for gap outcomes.

    Never raises to callers. Side effects are fire-and-forget threads.
    """
    try:
        notify_parent_question(
            question=question,
            reply=reply,
            wa_from=wa_from,
            outcome=outcome,
            session_id=session_id,
            language=language,
            wa_message_id=wa_message_id,
        )
        notify_needs_attention(
            question=question,
            reply=reply,
            wa_from=wa_from,
            outcome=outcome,
            session_id=session_id,
            language=language,
            wa_message_id=wa_message_id,
        )
    except Exception:
        logger.exception("slack_notify_interaction_failed")
