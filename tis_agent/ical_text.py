"""Convert iCalendar (.ics) feeds to plain text and per-event RAG chunks."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from tis_agent.handbook import Chunk

DEFAULT_PAST_DAYS = 0
DEFAULT_FUTURE_DAYS = 21


def _unfold_lines(raw: str) -> list[str]:
    lines: list[str] = []
    for line in raw.replace("\r\n", "\n").split("\n"):
        if line.startswith((" ", "\t")) and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def _parse_dt(value: str, tz: ZoneInfo) -> datetime | date | None:
    value = value.strip()
    if not value:
        return None
    if "T" in value:
        clean = value.replace("Z", "+00:00")
        if re.search(r"[+-]\d{4}$", clean):
            clean = clean[:-2] + ":" + clean[-2:]
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        return dt.astimezone(tz)
    return datetime.strptime(value, "%Y%m%d").date()


def _is_date_only(value: datetime | date) -> bool:
    return isinstance(value, date) and not isinstance(value, datetime)


def _as_date(value: datetime | date, tz: ZoneInfo) -> date:
    if isinstance(value, datetime):
        return value.astimezone(tz).date()
    return value


def inclusive_end(
    start: datetime | date | None,
    end: datetime | date | None,
) -> datetime | date | None:
    """ICS all-day DTEND is exclusive; store the last included calendar day."""
    if start is None or end is None:
        return end
    if _is_date_only(start) and _is_date_only(end) and end > start:
        return end - timedelta(days=1)
    return end


def _format_event(
    start: datetime | date | None,
    end: datetime | date | None,
    summary: str,
    description: str,
) -> str:
    lines = [f"Event: {summary.strip() or 'Untitled'}"]
    if start:
        if isinstance(start, datetime):
            lines.append(f"Starts: {start.strftime('%Y-%m-%d %H:%M %Z')}")
        else:
            lines.append(f"Starts: {start.isoformat()} (all day)")
    if end and end != start:
        if isinstance(end, datetime):
            lines.append(f"Ends: {end.strftime('%Y-%m-%d %H:%M %Z')}")
        else:
            lines.append(f"Ends: {end.isoformat()} (all day)")
    if description.strip():
        desc = re.sub(r"\\n", "\n", description).replace("\\,", ",").strip()
        lines.append(f"Details: {desc}")
    return "\n".join(lines)


@dataclass(frozen=True)
class CalendarEvent:
    summary: str
    start: datetime | date
    end: datetime | date | None
    text: str

    def date_span(self, tz: ZoneInfo) -> tuple[date, date]:
        start_d = _as_date(self.start, tz)
        end_d = _as_date(self.end, tz) if self.end is not None else start_d
        if end_d < start_d:
            end_d = start_d
        return start_d, end_d


def parse_ics_events(
    raw: str,
    *,
    timezone: str = "Asia/Tokyo",
    past_days: int = DEFAULT_PAST_DAYS,
    future_days: int = DEFAULT_FUTURE_DAYS,
    now: datetime | None = None,
) -> tuple[list[CalendarEvent], date, date]:
    tz = ZoneInfo(timezone)
    now = now or datetime.now(tz)
    window_start = now - timedelta(days=past_days)
    window_end = now + timedelta(days=future_days)

    events: list[tuple[datetime, CalendarEvent]] = []
    for block in raw.split("BEGIN:VEVENT")[1:]:
        chunk = block.split("END:VEVENT", 1)[0]
        fields: dict[str, str] = {}
        for line in _unfold_lines(chunk):
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.split(";", 1)[0].upper()
            fields[key] = value

        summary = fields.get("SUMMARY", "")
        description = fields.get("DESCRIPTION", "")
        start = _parse_dt(fields.get("DTSTART", ""), tz)
        end = inclusive_end(start, _parse_dt(fields.get("DTEND", ""), tz))
        if start is None:
            continue
        sort_key = (
            start
            if isinstance(start, datetime)
            else datetime.combine(start, datetime.min.time(), tz)
        )
        if sort_key < window_start or sort_key > window_end:
            continue
        text = _format_event(start, end, summary, description)
        events.append(
            (
                sort_key,
                CalendarEvent(
                    summary=summary.strip() or "Untitled",
                    start=start,
                    end=end,
                    text=text,
                ),
            )
        )

    events.sort(key=lambda item: item[0])
    return [item[1] for item in events], window_start.date(), window_end.date()


def events_to_chunks(
    events: list[CalendarEvent],
    *,
    timezone: str = "Asia/Tokyo",
) -> list[Chunk]:
    tz = ZoneInfo(timezone)
    chunks: list[Chunk] = []
    for i, event in enumerate(events):
        start_d, end_d = event.date_span(tz)
        chunks.append(
            Chunk(
                content=event.text,
                section_title=event.summary,
                page_start=1,
                page_end=1,
                chunk_index=i,
                start_date=start_d,
                end_date=end_d,
                event_type="calendar_event",
            )
        )
    return chunks


_STARTS_RE = re.compile(
    r"^Starts:\s+(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2}|\s+\(all day\))?",
    re.MULTILINE,
)
_ENDS_RE = re.compile(
    r"^Ends:\s+(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2}|\s+\(all day\))?",
    re.MULTILINE,
)
_EVENT_RE = re.compile(r"^Event:\s+(.+)$", re.MULTILINE)


def chunks_from_formatted_calendar(text: str) -> list[Chunk]:
    """Split our own ICS-to-text format into one chunk per event."""
    parts = re.split(r"\n---\n", text)
    events: list[str] = []
    for part in parts:
        piece = part.strip()
        if "\nEvent:" in piece and not piece.startswith("Event:"):
            _, _, rest = piece.partition("Event:")
            piece = "Event:" + rest
        if not piece.startswith("Event:"):
            continue
        events.append(piece)

    chunks: list[Chunk] = []
    for i, block in enumerate(events):
        start_match = _STARTS_RE.search(block)
        end_match = _ENDS_RE.search(block)
        title_match = _EVENT_RE.search(block)
        start_d = date.fromisoformat(start_match.group(1)) if start_match else None
        end_d = date.fromisoformat(end_match.group(1)) if end_match else start_d
        chunks.append(
            Chunk(
                content=block.strip(),
                section_title=(title_match.group(1).strip() if title_match else None),
                page_start=1,
                page_end=1,
                chunk_index=i,
                start_date=start_d,
                end_date=end_d,
                event_type="calendar_event",
            )
        )
    return chunks


def calendar_chunks_from_bytes(data: bytes, *, timezone: str = "Asia/Tokyo") -> list[Chunk]:
    text = data.decode("utf-8", errors="replace")
    if "BEGIN:VEVENT" in text:
        events, _, _ = parse_ics_events(text, timezone=timezone)
        return events_to_chunks(events, timezone=timezone)
    return chunks_from_formatted_calendar(text)


def ics_to_text(
    raw: str,
    *,
    timezone: str = "Asia/Tokyo",
    past_days: int = DEFAULT_PAST_DAYS,
    future_days: int = DEFAULT_FUTURE_DAYS,
) -> str:
    """Parse ICS and return plain-text events in a useful window for parents."""
    events, window_start, window_end = parse_ics_events(
        raw, timezone=timezone, past_days=past_days, future_days=future_days
    )
    if not events:
        return "No upcoming school calendar events found in the feed window."

    header = (
        "TIS Parent Calendar (official Google Calendar feed)\n"
        f"Timezone: {timezone}\n"
        f"Showing events from {window_start.isoformat()} to {window_end.isoformat()}.\n"
    )
    return header + "\n\n" + "\n\n---\n\n".join(event.text for event in events)
