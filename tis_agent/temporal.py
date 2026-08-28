"""Reusable temporal retrieval helpers for date/schedule questions.

Resolve relative time in Asia/Tokyo, rewrite retrieval queries, and drop
chunks that refer to the wrong dates. "This week" / "next week" are school
days: Monday–Friday (TIS is an IB school).
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

SCHOOL_TZ = ZoneInfo("Asia/Tokyo")

TemporalKind = Literal["none", "date_anchored", "event_date_lookup"]

_WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
    "måndag": 0,
    "tisdag": 1,
    "onsdag": 2,
    "torsdag": 3,
    "fredag": 4,
    "lördag": 5,
    "söndag": 6,
}

_MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
    "januari": 1,
    "februari": 2,
    "mars": 3,
    "april": 4,
    "maj": 5,
    "juni": 6,
    "juli": 7,
    "augusti": 8,
    "oktober": 10,
}

_WEEKDAY_ALT = "|".join(sorted(_WEEKDAYS, key=len, reverse=True))
_MONTH_ALT = "|".join(sorted(_MONTHS, key=len, reverse=True))
_ISO_DATE_RE = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
_NUMERIC_DATE_RE = re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b")
_WRITTEN_MDY_RE = re.compile(
    rf"\b({_MONTH_ALT})\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s*(20\d{{2}}))?\b",
    re.IGNORECASE,
)
_WRITTEN_DMY_RE = re.compile(
    rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_ALT})(?:,?\s*(20\d{{2}}))?\b",
    re.IGNORECASE,
)

_EVENT_WHEN_RE = re.compile(
    r"\b("
    r"when(?:'s|s)?\s+is"
    r"|what(?:'s|s)?\s+(?:the\s+)?(?:date|day)"
    r"|what\s+day\s+is"
    r"|när\s+(?:är|har\s+vi|infaller)"
    r"|vilket\s+datum"
    r")\b",
    re.IGNORECASE,
)
_PROCEDURAL_WHEN_RE = re.compile(
    r"\bwhen\s+(?:should|do|must|can|will)\s+i\b"
    r"|\bwhen\s+to\b"
    r"|\bnär\s+ska\s+jag\b"
    r"|\bnär\s+måste\s+jag\b",
    re.IGNORECASE,
)

_RELATIVE_UNITS = re.compile(
    r"\b(?:in|om)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)"
    r"\s+(day|days|week|weeks|dag|dagar|vecka|veckor)\b",
    re.IGNORECASE,
)

_WORD_NUMBERS = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}


@dataclass(frozen=True)
class DateRange:
    start: date
    end: date  # inclusive

    def contains(self, value: date) -> bool:
        return self.start <= value <= self.end

    def overlaps(self, other_start: date, other_end: date | None = None) -> bool:
        other_end = other_end or other_start
        return other_start <= self.end and other_end >= self.start

    def days(self) -> list[date]:
        out: list[date] = []
        cursor = self.start
        while cursor <= self.end:
            out.append(cursor)
            cursor += timedelta(days=1)
        return out

    def label(self) -> str:
        if self.start == self.end:
            return self.start.isoformat()
        return f"{self.start.isoformat()} to {self.end.isoformat()}"


@dataclass(frozen=True)
class TemporalQuery:
    kind: TemporalKind
    original: str
    date_range: DateRange | None = None
    label: str = ""

    @property
    def is_temporal(self) -> bool:
        return self.kind != "none"


def tokyo_today() -> date:
    return datetime.now(SCHOOL_TZ).date()


def school_week(day: date) -> DateRange:
    """Monday–Friday of the ISO week that contains `day`."""
    monday = day - timedelta(days=day.weekday())
    return DateRange(monday, monday + timedelta(days=4))


def _month_range(year: int, month: int) -> DateRange:
    last = calendar.monthrange(year, month)[1]
    return DateRange(date(year, month, 1), date(year, month, last))


def _add_months(day: date, months: int) -> date:
    year = day.year + (day.month - 1 + months) // 12
    month = (day.month - 1 + months) % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last))


def _weekend(day: date, *, next_weekend: bool = False) -> DateRange:
    monday = day - timedelta(days=day.weekday())
    saturday = monday + timedelta(days=5)
    sunday = monday + timedelta(days=6)
    if next_weekend:
        saturday += timedelta(days=7)
        sunday += timedelta(days=7)
    return DateRange(saturday, sunday)


def next_weekday(today: date, weekday: int) -> date:
    """Next occurrence of weekday strictly after today; if today is that day, +7."""
    delta = (weekday - today.weekday()) % 7
    if delta == 0:
        delta = 7
    return today + timedelta(days=delta)


def this_weekday(today: date, weekday: int) -> date:
    """That weekday in the current school week (Mon–Sun), even if already past."""
    monday = today - timedelta(days=today.weekday())
    return monday + timedelta(days=weekday)


def upcoming_weekday(today: date, weekday: int) -> date:
    """Soonest occurrence of weekday, including today."""
    delta = (weekday - today.weekday()) % 7
    return today + timedelta(days=delta)


def _parse_int_word(raw: str) -> int | None:
    raw = raw.lower()
    if raw.isdigit():
        return int(raw)
    return _WORD_NUMBERS.get(raw)


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _year_for_month_day(today: date, month: int, day: int) -> int:
    candidate = _safe_date(today.year, month, day)
    if candidate is None:
        return today.year
    if candidate < today - timedelta(days=14):
        return today.year + 1
    return today.year


def extract_dates_from_text(text: str, *, today: date | None = None) -> list[date]:
    """Pull concrete calendar dates out of chunk or question text."""
    today = today or tokyo_today()
    found: list[date] = []
    seen: set[date] = set()

    def add(value: date | None) -> None:
        if value is None or value in seen:
            return
        seen.add(value)
        found.append(value)

    for match in _ISO_DATE_RE.finditer(text):
        add(_safe_date(int(match.group(1)), int(match.group(2)), int(match.group(3))))

    for match in _NUMERIC_DATE_RE.finditer(text):
        first, second, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        # School context: prefer D/M/Y (17/09/2026) over M/D/Y.
        if first > 12:
            add(_safe_date(year, second, first))
        elif second > 12:
            add(_safe_date(year, first, second))
        else:
            add(_safe_date(year, second, first))

    for match in _WRITTEN_MDY_RE.finditer(text):
        month = _MONTHS[match.group(1).lower()]
        day = int(match.group(2))
        year = int(match.group(3)) if match.group(3) else _year_for_month_day(today, month, day)
        add(_safe_date(year, month, day))

    for match in _WRITTEN_DMY_RE.finditer(text):
        day = int(match.group(1))
        month = _MONTHS[match.group(2).lower()]
        year = int(match.group(3)) if match.group(3) else _year_for_month_day(today, month, day)
        add(_safe_date(year, month, day))

    return found


def parse_absolute_range(text: str, *, today: date) -> DateRange | None:
    dates = extract_dates_from_text(text, today=today)
    if not dates:
        return None
    if len(dates) == 1:
        return DateRange(dates[0], dates[0])
    return DateRange(min(dates), max(dates))


def _match_relative(text: str, today: date) -> DateRange | None:
    lower = text.lower()

    if re.search(r"\b(day after tomorrow|i övermorgon|övermorgon)\b", lower):
        return DateRange(today + timedelta(days=2), today + timedelta(days=2))
    if re.search(r"\b(today|tonight|this morning|this afternoon|this evening|idag)\b", lower):
        return DateRange(today, today)
    if re.search(r"\b(tomorrow|imorgon|i morgon)\b", lower):
        return DateRange(today + timedelta(days=1), today + timedelta(days=1))
    if re.search(r"\b(yesterday|igår|i går)\b", lower):
        return DateRange(today - timedelta(days=1), today - timedelta(days=1))

    if re.search(r"\b(next weekend|nästa helg)\b", lower):
        return _weekend(today, next_weekend=True)
    if re.search(r"\b(this weekend|the weekend|i helgen|helgen)\b", lower):
        return _weekend(today)

    if re.search(r"\b(next week|nästa vecka|i nästa vecka)\b", lower):
        return school_week(today + timedelta(days=7))
    if re.search(r"\b(this week|den här veckan|i veckan|veckan)\b", lower):
        return school_week(today)

    if re.search(r"\b(next month|nästa månad)\b", lower):
        nxt = _add_months(today.replace(day=1), 1)
        return _month_range(nxt.year, nxt.month)
    if re.search(r"\b(this month|den här månaden|i månaden)\b", lower):
        return _month_range(today.year, today.month)

    unit_match = _RELATIVE_UNITS.search(lower)
    if unit_match:
        amount = _parse_int_word(unit_match.group(1))
        if amount:
            unit = unit_match.group(2)
            if unit.startswith(("week", "veck")):
                target = today + timedelta(weeks=amount)
                return school_week(target)
            target = today + timedelta(days=amount)
            return DateRange(target, target)

    weekday_match = re.search(
        rf"\b(next|this|på|kommande|coming)?\s*({_WEEKDAY_ALT})s?\b",
        lower,
    )
    if weekday_match:
        qualifier = (weekday_match.group(1) or "").strip()
        weekday = _WEEKDAYS[weekday_match.group(2)]
        if qualifier in {"next", "kommande", "coming"}:
            day = next_weekday(today, weekday)
        elif qualifier in {"this"}:
            day = this_weekday(today, weekday)
        else:
            day = upcoming_weekday(today, weekday)
        return DateRange(day, day)

    return parse_absolute_range(text, today=today)


def _is_event_date_lookup(text: str) -> bool:
    if _PROCEDURAL_WHEN_RE.search(text):
        return False
    return bool(_EVENT_WHEN_RE.search(text))


_WHATS_ON_RE = re.compile(
    r"\b("
    r"happen(?:ing|s)?"
    r"|anything\s+special"
    r"|any(?:thing)?\s+(?:on|planned|scheduled)"
    r"|what(?:'s|s| is)\s+on"
    r"|going\s+on"
    r"|any\s+events?"
    r"|what\s+events?"
    r"|något\s+speciellt|något\s+särskilt|vad\s+händer|något\s+på\s+gång"
    r")\b",
    re.IGNORECASE,
)


def is_whats_on_question(question: str) -> bool:
    """True for 'anything happening today / this week' schedule questions."""
    return bool(_WHATS_ON_RE.search(question or ""))


def parse_temporal(question: str, *, today: date | None = None) -> TemporalQuery:
    """Detect temporal intent and resolve it against the Tokyo school calendar."""
    today = today or tokyo_today()
    original = question.strip()
    if not original:
        return TemporalQuery(kind="none", original=original)

    date_range = _match_relative(original, today)
    if date_range is not None:
        return TemporalQuery(
            kind="date_anchored",
            original=original,
            date_range=date_range,
            label=date_range.label(),
        )

    if _is_event_date_lookup(original):
        return TemporalQuery(
            kind="event_date_lookup",
            original=original,
            label="event date",
        )

    return TemporalQuery(kind="none", original=original)


def retrieval_queries(temporal: TemporalQuery) -> list[str]:
    """Queries to embed. Original question is always included."""
    question = temporal.original.strip()
    queries = [question]
    if temporal.kind == "none":
        return queries

    concepts = "event calendar schedule deadline activity holiday assembly"
    if temporal.kind == "event_date_lookup":
        queries.append(f"{question} {concepts} date")
        return _dedupe(queries)

    assert temporal.date_range is not None
    rng = temporal.date_range
    if rng.start == rng.end:
        day = rng.start
        weekday = day.strftime("%A")
        written = f"{day.strftime('%B')} {day.day}, {day.year}"
        queries.extend(
            [
                f"{day.isoformat()} TIS {concepts}",
                f"{weekday} {written} TIS school event calendar",
                f"{question} {day.isoformat()}",
            ]
        )
    else:
        queries.extend(
            [
                f"{rng.start.isoformat()} to {rng.end.isoformat()} TIS {concepts}",
                f"{question} {rng.start.isoformat()} {rng.end.isoformat()}",
            ]
        )
    return _dedupe(queries)[:4]


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


_WINDOW_STUB_RE = re.compile(
    r"no posts dated between|no recent articles were found during this sync",
    re.IGNORECASE,
)


def is_sync_window_stub(content: str, *, document_title: str | None = None) -> bool:
    """True for TIS Times empty-window placeholders, which are not event evidence."""
    if _WINDOW_STUB_RE.search(content or ""):
        return True
    title = (document_title or "").lower()
    if "tis times" in title and "no posts" in (content or "").lower():
        return True
    return False


def chunk_overlaps_range(
    content: str,
    rng: DateRange,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    today: date | None = None,
    document_title: str | None = None,
) -> bool:
    if is_sync_window_stub(content, document_title=document_title):
        return False
    if start_date is not None:
        return rng.overlaps(start_date, end_date or start_date)
    dates = extract_dates_from_text(content, today=today)
    if not dates:
        return False
    return any(rng.contains(day) for day in dates)


def grounding_instruction(temporal: TemporalQuery) -> str:
    if temporal.kind == "date_anchored" and temporal.date_range is not None:
        rng = temporal.date_range
        return (
            f"The parent is asking about {rng.label()} "
            f"({rng.start.strftime('%A')} to {rng.end.strftime('%A')}, Asia/Tokyo). "
            "The TIS Parent Calendar is the primary source for school events, holidays, "
            "and the daily schedule. Also use the handbook and other excerpts if they "
            "mention that date. TIS Times is portal news only — a note that TIS Times "
            "has no posts in a date window does not mean nothing is happening at school, "
            "and must not be the answer by itself. The weekly bulletin is school-wide "
            "notices, not the calendar. "
            "Only use excerpts that refer to that date range. "
            "A similar event on a different date is not an answer."
        )
    if temporal.kind == "event_date_lookup":
        return (
            "The parent is asking when a named event occurs. "
            "Quote the date only if an excerpt states it explicitly."
        )
    return ""
