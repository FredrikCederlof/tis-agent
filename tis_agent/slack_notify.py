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

SCHOOL_TZ = ZoneInfo("Asia/Tokyo")
REPLY_TRUNCATE_CHARS = 2500

_ENV_PARENT = "SLACK_WEBHOOK_PARENT_QUESTIONS"
_ENV_NEEDS = "SLACK_WEBHOOK_NEEDS_ATTENTION"

_missing_logged: set[str] = set()


def mask_wa_from(wa_from: str | None) -> str:
    """Masked parent id, e.g. Parent ·••1234 — last four digits only."""
    digits = re.sub(r"\D", "", wa_from or "")
    if len(digits) >= 4:
        return f"Parent ·••{digits[-4:]}"
    if digits:
        return f"Parent ·••{digits}"
    return "Parent"


def should_notify_needs_attention(outcome: str | None) -> bool:
    return (outcome or "") in GAP_OUTCOMES


def _truncate(text: str, limit: int = REPLY_TRUNCATE_CHARS) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _webhook(env_name: str) -> str:
    return (os.environ.get(env_name) or "").strip()


def _log_missing_once(env_name: str) -> None:
    if env_name in _missing_logged:
        return
    _missing_logged.add(env_name)
    logger.info("slack_notify_skip reason=not_configured env=%s", env_name)


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
) -> dict[str, Any]:
    """Build Slack Incoming Webhook body (text + Block Kit)."""
    when = when or datetime.now(SCHOOL_TZ)
    when_iso = when.astimezone(SCHOOL_TZ).isoformat(timespec="seconds")
    masked = mask_wa_from(wa_from)
    reply_text = _truncate(reply or "")
    question_text = question or ""

    meta_lines = [
        f"*When:* {when_iso}",
        f"*From:* {masked}",
        f"*Outcome:* `{outcome}`",
    ]
    if session_id:
        meta_lines.append(f"*Session:* `{session_id}`")
    if language:
        meta_lines.append(f"*Language:* `{language}`")
    if wa_message_id:
        meta_lines.append(f"*WA message:* `{wa_message_id}`")

    fallback = (
        f"{title}\n"
        f"Q: {question_text}\n"
        f"A: {reply_text}\n"
        f"{masked} · {outcome} · {when_iso}"
    )

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
    url = _webhook(_ENV_PARENT)
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

    def _send() -> None:
        try:
            _post_webhook(url, payload, label="parent_questions")
        except urllib.error.HTTPError as exc:
            logger.warning(
                "slack_notify_http channel=parent_questions status=%s", exc.code
            )
        except Exception:
            logger.exception("slack_notify_failed channel=parent_questions")

    threading.Thread(target=_send, name="tina-slack-parent", daemon=True).start()


def notify_needs_attention(
    *,
    question: str,
    reply: str | None,
    wa_from: str | None,
    outcome: str,
    session_id: str | None = None,
    language: str | None = None,
    wa_message_id: str | None = None,
) -> None:
    """POST gap outcomes to #tina-needs-attention. Never raises; daemon thread."""
    if not should_notify_needs_attention(outcome):
        return

    url = _webhook(_ENV_NEEDS)
    if not url:
        _log_missing_once(_ENV_NEEDS)
        return

    payload = format_slack_payload(
        title="Needs attention",
        question=question,
        reply=reply,
        wa_from=wa_from,
        outcome=outcome,
        session_id=session_id,
        language=language,
        wa_message_id=wa_message_id,
    )

    def _send() -> None:
        try:
            _post_webhook(url, payload, label="needs_attention")
        except urllib.error.HTTPError as exc:
            logger.warning(
                "slack_notify_http channel=needs_attention status=%s", exc.code
            )
        except Exception:
            logger.exception("slack_notify_failed channel=needs_attention")

    threading.Thread(target=_send, name="tina-slack-needs", daemon=True).start()


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
