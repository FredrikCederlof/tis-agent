"""Read-only operational snapshot for the TRMNL e-ink dashboard.

All clocks are Asia/Tokyo. A failed metric becomes an explicit fallback
and does not blank the rest of the payload. Question text is never logged.

Needs attention
    Open conversations in Tina Admin: `admin_session_list.needs_attention`,
    which is true when a session still has an unreviewed gap or a manual
    flag. This is a conversation count, not an interaction count.
    0 → "All caught up". Above 0 → "Action required".

Questions today
    WhatsApp parent questions (`interactions.channel = whatsapp`) since
    00:00 today, compared with the previous Tokyo day.
    "+N vs yesterday", "−N vs yesterday", or "Same as yesterday".

Answered by Tina
    This calendar week (Monday 00:00 through now) versus the previous
    Monday–Sunday week.
    Numerator: outcome in (success, fixed_answer). Tina produced an answer.
    Denominator: every WhatsApp interaction whose question is not blank.
    Errors and knowledge gaps stay in the denominator. They are parent
    questions Tina did not answer successfully.
    Excluded: `sandbox_messages` (admin tests; they are not in
    `interactions`), and blank questions. Stored rows are already deduped
    by WhatsApp message id, so this dashboard does not remove duplicates
    again. There is no system-event flag on `interactions`.
    Rate is rounded to a whole percent. The comparison is the difference
    of those rounded percents, in percentage points.
    No eligible questions this week → "—" and "Not enough data", never 0%.
    A real week of only misses still shows 0%.

Knowledge coverage
    The admin Success rate, unchanged: grounded answers ÷ (grounded
    answers + knowledge gaps) over the trailing 7 Tokyo days, including
    today. Fixed answers and errors stay out of both sides.
    The weekly line compares that window with the previous 7 days.
    Either window empty → that side is "—", not 0%.

Time saved
    Answered questions this calendar week (success + fixed_answer) ×
    `agent_config.minutes_saved_per_question`. Missing config → "—".
    A configured rate and zero answers → "0m".

Top knowledge gap
    Highest-priority open row in `unanswered_interactions`: a manual flag
    first, then `no_evidence`, then `low_confidence`, newest first.
    The card shows a redacted English snippet of at most 48 characters.
    There is no separate topic field. No open row → "No current gaps".

Latest activity
    Newest WhatsApp question since 00:00 today. Display text prefers
    `question_en`, then `question`. The language code is the stored
    `language` (else `source_language`). Status is Answered, Unanswered,
    or Needs attention. No question today → empty state in the template.
"""

from __future__ import annotations

import hmac
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Any

from tis_agent.analytics import (
    OUTCOME_ERROR,
    OUTCOME_FIXED_ANSWER,
    OUTCOME_LOW_CONFIDENCE,
    OUTCOME_NO_EVIDENCE,
    OUTCOME_SUCCESS,
)
from tis_agent.temporal import SCHOOL_TZ

logger = logging.getLogger("tis_agent.trmnl_dashboard")

_PARENT_CHANNEL = "whatsapp"
_ACTIVITY_CHARS = 90
_GAP_CHARS = 48
_GAP_FETCH_LIMIT = 30
_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w.-]+\.\w+\b")
_INTL_PHONE_RE = re.compile(r"\+\d(?:[\s().-]*\d){7,}")
_LOCAL_PHONE_RE = re.compile(r"(?<!\d)0\d(?:[\s().-]*\d){7,}")
_LONG_DIGIT_RE = re.compile(r"(?<!\d)\d{10,}(?!\d)")
_ANSWERED = (OUTCOME_SUCCESS, OUTCOME_FIXED_ANSWER)
_GAPS = (OUTCOME_NO_EVIDENCE, OUTCOME_LOW_CONFIDENCE)
_UNAVAILABLE = "—"
_NOT_ENOUGH = "Not enough data"

_LATEST_COLUMNS = "question, question_en, language, source_language, outcome, created_at"
_GAP_COLUMNS = "question_en, question, outcome, manual_attention_at, created_at"


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


def tokyo_week_start(now: datetime) -> datetime:
    """Monday 00:00 Asia/Tokyo of the week that contains `now`."""
    start = tokyo_day_start(now)
    return start - timedelta(days=start.weekday())


def tokyo_coverage_start(now: datetime) -> datetime:
    """Start of the trailing 7 Tokyo days, including today."""
    return tokyo_day_start(now) - timedelta(days=6)


def coverage_percent(grounded: int, gaps: int) -> int:
    total = grounded + gaps
    if total <= 0:
        return 0
    return round(grounded * 100 / total)


def rate_percent(numerator: int | None, denominator: int | None) -> int | None:
    """Whole percent, or None when the rate cannot be calculated."""
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return round(numerator * 100 / denominator)


def format_time_saved(total_minutes: int) -> str:
    minutes = max(0, int(total_minutes))
    if minutes < 60:
        return f"{minutes}m"
    hours, rest = divmod(minutes, 60)
    if rest == 0:
        return f"{hours}h"
    return f"{hours}h {rest}m"


def attention_detail(count: int | None) -> str:
    if count is None:
        return "Unavailable"
    if count == 0:
        return "All caught up"
    return "Action required"


def day_comparison(today: int | None, yesterday: int | None) -> str:
    if today is None or yesterday is None:
        return "Unavailable"
    delta = today - yesterday
    if delta > 0:
        return f"+{delta} vs yesterday"
    if delta < 0:
        return f"−{abs(delta)} vs yesterday"
    return "Same as yesterday"


def pp_detail(current: int | None, previous: int | None) -> str:
    if current is None or previous is None:
        return _NOT_ENOUGH
    delta = current - previous
    if delta > 0:
        return f"+{delta} pp this week"
    if delta < 0:
        return f"−{abs(delta)} pp this week"
    return "Same this week"


def percent_label(value: int | None) -> str:
    if value is None:
        return _UNAVAILABLE
    return f"{value}%"


def sanitize_question(text: str, *, limit: int = _ACTIVITY_CHARS) -> str:
    """Collapse whitespace, redact contact details, and fit the e-ink card."""
    collapsed = re.sub(r"\s+", " ", text or "").strip()
    redacted = _EMAIL_RE.sub("[redacted]", collapsed)
    redacted = _INTL_PHONE_RE.sub("[redacted]", redacted)
    redacted = _LOCAL_PHONE_RE.sub("[redacted]", redacted)
    redacted = _LONG_DIGIT_RE.sub("[redacted]", redacted)
    redacted = re.sub(r"\s+", " ", redacted).strip()
    if len(redacted) <= limit:
        return redacted
    return redacted[: limit - 1].rstrip() + "…"


def _to_tokyo(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=SCHOOL_TZ)
    return parsed.astimezone(SCHOOL_TZ)


def _language_code(row: dict[str, Any]) -> str:
    raw = str(row.get("language") or row.get("source_language") or "").strip()
    if not raw:
        return ""
    return raw.upper()[:2]


def _status_label(outcome: str | None) -> str:
    if outcome in _ANSWERED:
        return "Answered"
    if outcome == OUTCOME_NO_EVIDENCE:
        return "Unanswered"
    if outcome in (OUTCOME_LOW_CONFIDENCE, OUTCOME_ERROR):
        return "Needs attention"
    return "Question"


def format_latest_activity(row: dict[str, Any] | None) -> dict[str, str] | None:
    if not row:
        return None
    text = sanitize_question(str(row.get("question_en") or row.get("question") or ""))
    if not text:
        return None
    status = _status_label(row.get("outcome"))
    created = row.get("created_at")
    clock = ""
    created_at = ""
    if created:
        local = _to_tokyo(str(created))
        clock = local.strftime("%H:%M")
        created_at = local.isoformat(timespec="seconds")
    meta = " · ".join(part for part in (_language_code(row), status, clock) if part)
    return {"text": text, "meta": meta, "created_at": created_at}


def _gap_sort_key(row: dict[str, Any]) -> tuple[int, int]:
    manual = 0 if row.get("manual_attention_at") else 1
    outcome = row.get("outcome")
    if outcome == OUTCOME_NO_EVIDENCE:
        kind = 0
    elif outcome == OUTCOME_LOW_CONFIDENCE:
        kind = 1
    else:
        kind = 2
    return (manual, kind)


def choose_gap(rows: list[dict[str, Any]] | None) -> dict[str, Any] | None:
    if not rows:
        return None
    newest_first = sorted(rows, key=lambda row: str(row.get("created_at") or ""), reverse=True)
    newest_first.sort(key=_gap_sort_key)
    return newest_first[0]


def gap_topic(row: dict[str, Any] | None, *, failed: bool = False) -> str:
    if failed:
        return _UNAVAILABLE
    if not row:
        return "No current gaps"
    text = sanitize_question(
        str(row.get("question_en") or row.get("question") or ""),
        limit=_GAP_CHARS,
    )
    return text or "No current gaps"


def _time_saved_label(answered: int | None, minutes_each: int | None) -> str:
    if answered is None or minutes_each is None:
        return _UNAVAILABLE
    return format_time_saved(answered * minutes_each)


def build_dashboard_payload(
    *,
    now: datetime,
    needs_attention: int | None,
    questions_today: int | None,
    questions_yesterday: int | None,
    answered_this_week: int | None,
    eligible_this_week: int | None,
    answered_last_week: int | None,
    eligible_last_week: int | None,
    coverage_grounded: int | None,
    coverage_gaps: int | None,
    previous_coverage_grounded: int | None,
    previous_coverage_gaps: int | None,
    minutes_each: int | None,
    latest: dict[str, Any] | None,
    gap: dict[str, Any] | None,
    gap_failed: bool = False,
) -> dict[str, Any]:
    local = now.astimezone(SCHOOL_TZ)
    answered_rate = rate_percent(answered_this_week, eligible_this_week)
    previous_answered_rate = rate_percent(answered_last_week, eligible_last_week)
    if coverage_grounded is None or coverage_gaps is None or coverage_grounded + coverage_gaps <= 0:
        coverage_rate = None
    else:
        coverage_rate = coverage_percent(coverage_grounded, coverage_gaps)
    if (
        previous_coverage_grounded is None
        or previous_coverage_gaps is None
        or previous_coverage_grounded + previous_coverage_gaps <= 0
    ):
        previous_coverage_rate = None
    else:
        previous_coverage_rate = coverage_percent(previous_coverage_grounded, previous_coverage_gaps)
    activity = format_latest_activity(latest)
    return {
        "metrics": {
            "needs_attention": needs_attention,
            "needs_attention_detail": attention_detail(needs_attention),
            "questions_today": questions_today,
            "questions_today_detail": day_comparison(questions_today, questions_yesterday),
            "new_today": questions_today,
            "answered_by_tina": percent_label(answered_rate),
            "answered_by_tina_detail": (
                _NOT_ENOUGH if answered_rate is None else pp_detail(answered_rate, previous_answered_rate)
            ),
            "knowledge_coverage": coverage_rate,
            "knowledge_coverage_label": percent_label(coverage_rate),
            "knowledge_coverage_detail": (
                _NOT_ENOUGH if coverage_rate is None else pp_detail(coverage_rate, previous_coverage_rate)
            ),
            "time_saved": _time_saved_label(answered_this_week, minutes_each),
            "time_saved_detail": "This week" if minutes_each is not None and answered_this_week is not None else "Unavailable",
            "knowledge_gap": gap_topic(gap, failed=gap_failed),
        },
        "latest_activity": activity,
        "latest_question": activity,
        "header_date": f"{local.strftime('%a')} {local.day} {local.strftime('%b')}",
        "updated_label": f"Updated {local.strftime('%H:%M')}",
        "last_updated": local.isoformat(timespec="seconds"),
        "timezone": "Asia/Tokyo",
    }


def _count(response: Any) -> int:
    if getattr(response, "count", None) is None:
        raise RuntimeError("Supabase count missing")
    return int(response.count)


def _safe_count(label: str, query: Any) -> int | None:
    try:
        return _count(query.execute())
    except Exception:
        logger.exception("TRMNL metric failed: %s", label)
        return None


def _parent_questions(query: Any) -> Any:
    return query.eq("channel", _PARENT_CHANNEL).neq("question", "")


def _outcome_in(query: Any, outcomes: tuple[str, ...]) -> Any:
    return query.in_("outcome", list(outcomes))


def _minutes_per_question(client: Any) -> int | None:
    try:
        response = (
            client.table("agent_config")
            .select("minutes_saved_per_question")
            .limit(1)
            .execute()
        )
    except Exception:
        logger.exception("TRMNL metric failed: minutes_saved")
        return None
    rows = response.data or []
    if not rows or rows[0].get("minutes_saved_per_question") is None:
        return None
    return max(0, int(rows[0]["minutes_saved_per_question"]))


def _one_row(label: str, query: Any) -> tuple[dict[str, Any] | None, bool]:
    try:
        response = query.execute()
    except Exception:
        logger.exception("TRMNL metric failed: %s", label)
        return None, True
    rows = response.data or []
    return (rows[0] if rows else None), False


def _gap_rows(client: Any) -> tuple[list[dict[str, Any]] | None, bool]:
    try:
        response = (
            client.table("unanswered_interactions")
            .select(_GAP_COLUMNS)
            .order("created_at", desc=True)
            .limit(_GAP_FETCH_LIMIT)
            .execute()
        )
    except Exception:
        logger.exception("TRMNL metric failed: knowledge_gap")
        return None, True
    return list(response.data or []), False


def load_dashboard(client: Any, now: datetime | None = None) -> dict[str, Any]:
    """Read dashboard KPIs. Read-only. One failed read does not abort the rest."""
    moment = now or datetime.now(SCHOOL_TZ)
    today = tokyo_day_start(moment)
    yesterday = today - timedelta(days=1)
    week = tokyo_week_start(moment)
    previous_week = week - timedelta(days=7)
    coverage_start = tokyo_coverage_start(moment)
    previous_coverage = coverage_start - timedelta(days=7)
    today_iso = today.isoformat(timespec="seconds")
    yesterday_iso = yesterday.isoformat(timespec="seconds")
    week_iso = week.isoformat(timespec="seconds")
    previous_week_iso = previous_week.isoformat(timespec="seconds")
    coverage_iso = coverage_start.isoformat(timespec="seconds")
    previous_coverage_iso = previous_coverage.isoformat(timespec="seconds")

    def count_between(label: str, start: str, end: str | None, outcomes: tuple[str, ...] | None) -> int | None:
        query = client.table("interactions").select("id", count="exact", head=True)
        query = _parent_questions(query).gte("created_at", start)
        if end is not None:
            query = query.lt("created_at", end)
        if outcomes is not None:
            query = _outcome_in(query, outcomes)
        return _safe_count(label, query)

    needs = _safe_count(
        "needs_attention",
        client.table("admin_session_list")
        .select("id", count="exact", head=True)
        .eq("needs_attention", True),
    )
    questions_today = count_between("questions_today", today_iso, None, None)
    questions_yesterday = count_between("questions_yesterday", yesterday_iso, today_iso, None)
    eligible_this_week = count_between("eligible_this_week", week_iso, None, None)
    answered_this_week = count_between("answered_this_week", week_iso, None, _ANSWERED)
    eligible_last_week = count_between("eligible_last_week", previous_week_iso, week_iso, None)
    answered_last_week = count_between("answered_last_week", previous_week_iso, week_iso, _ANSWERED)
    coverage_grounded = count_between("coverage_grounded", coverage_iso, None, (OUTCOME_SUCCESS,))
    coverage_gaps = count_between("coverage_gaps", coverage_iso, None, _GAPS)
    previous_grounded = count_between(
        "previous_coverage_grounded",
        previous_coverage_iso,
        coverage_iso,
        (OUTCOME_SUCCESS,),
    )
    previous_gaps = count_between("previous_coverage_gaps", previous_coverage_iso, coverage_iso, _GAPS)
    minutes_each = _minutes_per_question(client)
    latest, latest_failed = _one_row(
        "latest_activity",
        client.table("interactions")
        .select(_LATEST_COLUMNS)
        .eq("channel", _PARENT_CHANNEL)
        .gte("created_at", today_iso)
        .order("created_at", desc=True)
        .limit(1),
    )
    gap_rows, gap_failed = _gap_rows(client)
    return build_dashboard_payload(
        now=moment,
        needs_attention=needs,
        questions_today=questions_today,
        questions_yesterday=questions_yesterday,
        answered_this_week=answered_this_week,
        eligible_this_week=eligible_this_week,
        answered_last_week=answered_last_week,
        eligible_last_week=eligible_last_week,
        coverage_grounded=coverage_grounded,
        coverage_gaps=coverage_gaps,
        previous_coverage_grounded=previous_grounded,
        previous_coverage_gaps=previous_gaps,
        minutes_each=minutes_each,
        latest=None if latest_failed else latest,
        gap=None if gap_failed else choose_gap(gap_rows),
        gap_failed=gap_failed,
    )


def load_dashboard_from_env(now: datetime | None = None) -> dict[str, Any]:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("Supabase is not configured")
    from supabase import create_client

    return load_dashboard(create_client(url, key), now)
