"""Read-only operational snapshot for the TRMNL e-ink dashboard.

KPI definitions match the live Tina Admin dashboard:

- needs_attention: open Needs attention queue (`unanswered_interactions`).
  Unreviewed auto gaps plus manually flagged questions. Same count as
  the admin "Needs attention" card, not limited to today.
- unanswered: the no_evidence rows inside that queue. Admin labels
  those "Unanswered"; low confidence and manual flags stay in the
  broader Needs attention count.
- new_today: parent questions (`interactions`) since 00:00 Asia/Tokyo.

Grade and category are not stored. The latest-question meta line is
outcome plus Tokyo time. Parent phone numbers, session ids, and replies
are never selected.
"""

from __future__ import annotations

import hmac
import os
import re
from datetime import datetime
from typing import Any

from tis_agent.analytics import OUTCOME_ERROR, OUTCOME_NO_EVIDENCE
from tis_agent.temporal import SCHOOL_TZ

_MAX_QUESTION_CHARS = 140
_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w.-]+\.\w+\b")
_INTL_PHONE_RE = re.compile(r"\+\d(?:[\s().-]*\d){7,}")
_LOCAL_PHONE_RE = re.compile(r"(?<!\d)0\d(?:[\s().-]*\d){7,}")
_LONG_DIGIT_RE = re.compile(r"(?<!\d)\d{10,}(?!\d)")

_OUTCOME_LABELS = {
    "success": "Answered",
    "no_evidence": "Unanswered",
    "low_confidence": "Needs review",
    "fixed_answer": "Fixed answer",
    OUTCOME_ERROR: "Error",
}

_LATEST_COLUMNS = "question, question_en, outcome, created_at"


def trmnl_authorized(authorization_header: str | None, secret: str | None) -> bool:
    """True when the header is exactly `Bearer <secret>`."""
    token = (secret or "").strip()
    if not token:
        return False
    expected = f"Bearer {token}"
    header = authorization_header or ""
    if len(header) != len(expected):
        return False
    return hmac.compare_digest(header, expected)


def tokyo_day_start(now: datetime) -> datetime:
    local = now.astimezone(SCHOOL_TZ)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def sanitize_question(text: str) -> str:
    """Collapse whitespace, redact contact details, and fit the e-ink card."""
    collapsed = re.sub(r"\s+", " ", text or "").strip()
    redacted = _EMAIL_RE.sub("[redacted]", collapsed)
    redacted = _INTL_PHONE_RE.sub("[redacted]", redacted)
    redacted = _LOCAL_PHONE_RE.sub("[redacted]", redacted)
    redacted = _LONG_DIGIT_RE.sub("[redacted]", redacted)
    redacted = re.sub(r"\s+", " ", redacted).strip()
    if len(redacted) <= _MAX_QUESTION_CHARS:
        return redacted
    return redacted[: _MAX_QUESTION_CHARS - 1].rstrip() + "…"


def _to_tokyo(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=SCHOOL_TZ)
    return parsed.astimezone(SCHOOL_TZ)


def _outcome_label(outcome: str | None) -> str:
    if not outcome:
        return "Question"
    return _OUTCOME_LABELS.get(outcome, "Question")


def format_latest_question(row: dict[str, Any] | None) -> dict[str, str] | None:
    if not row:
        return None
    text = sanitize_question(str(row.get("question_en") or row.get("question") or ""))
    if not text:
        return None
    created = row.get("created_at")
    if not created:
        return {"text": text, "meta": _outcome_label(row.get("outcome")), "created_at": ""}
    local = _to_tokyo(str(created))
    return {
        "text": text,
        "meta": f"{_outcome_label(row.get('outcome'))} · {local.strftime('%H:%M')}",
        "created_at": local.isoformat(timespec="seconds"),
    }


def build_dashboard_payload(
    *,
    needs_attention: int,
    unanswered: int,
    new_today: int,
    latest: dict[str, Any] | None,
    now: datetime,
) -> dict[str, Any]:
    local = now.astimezone(SCHOOL_TZ)
    return {
        "metrics": {
            "needs_attention": needs_attention,
            "unanswered": unanswered,
            "new_today": new_today,
        },
        "latest_question": format_latest_question(latest),
        "header_date": f"{local.strftime('%a')} {local.day} {local.strftime('%b')}",
        "updated_label": f"Last updated {local.strftime('%H:%M')}",
        "last_updated": local.isoformat(timespec="seconds"),
        "timezone": "Asia/Tokyo",
    }


def _count(response: Any) -> int:
    if getattr(response, "count", None) is None:
        raise RuntimeError("Supabase count missing")
    return int(response.count)


def load_dashboard(client: Any, now: datetime | None = None) -> dict[str, Any]:
    """Read the three KPIs and the latest question. Read-only."""
    moment = now or datetime.now(SCHOOL_TZ)
    day_start = tokyo_day_start(moment).isoformat(timespec="seconds")

    needs = _count(
        client.table("unanswered_interactions")
        .select("id", count="exact", head=True)
        .execute()
    )
    unanswered = _count(
        client.table("unanswered_interactions")
        .select("id", count="exact", head=True)
        .eq("outcome", OUTCOME_NO_EVIDENCE)
        .execute()
    )
    new_today = _count(
        client.table("interactions")
        .select("id", count="exact", head=True)
        .gte("created_at", day_start)
        .execute()
    )
    latest_response = (
        client.table("interactions")
        .select(_LATEST_COLUMNS)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = latest_response.data or []
    latest = rows[0] if rows else None
    return build_dashboard_payload(
        needs_attention=needs,
        unanswered=unanswered,
        new_today=new_today,
        latest=latest,
        now=moment,
    )


def load_dashboard_from_env(now: datetime | None = None) -> dict[str, Any]:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("Supabase is not configured")
    from supabase import create_client

    return load_dashboard(create_client(url, key), now)
