"""Convert iCalendar (.ics) feeds to plain text for RAG."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo


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


def ics_to_text(
    raw: str,
    *,
    timezone: str = "Asia/Tokyo",
    past_days: int = 30,
    future_days: int = 365,
) -> str:
    """Parse ICS and return plain-text events in a useful window for parents."""
    tz = ZoneInfo(timezone)
    now = datetime.now(tz)
    window_start = now - timedelta(days=past_days)
    window_end = now + timedelta(days=future_days)

    blocks = raw.split("BEGIN:VEVENT")
    events: list[tuple[datetime | date, str]] = []

    for block in blocks[1:]:
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
        end = _parse_dt(fields.get("DTEND", ""), tz)

        if start is None:
            continue
        sort_key = start if isinstance(start, datetime) else datetime.combine(start, datetime.min.time(), tz)
        if sort_key < window_start or sort_key > window_end:
            continue
        events.append((sort_key, _format_event(start, end, summary, description)))

    events.sort(key=lambda item: item[0])
    if not events:
        return "No upcoming school calendar events found in the feed window."

    header = (
        "TIS Parent Calendar (official Google Calendar feed)\n"
        f"Timezone: {timezone}\n"
        f"Showing events from {window_start.date().isoformat()} to {window_end.date().isoformat()}.\n"
    )
    return header + "\n\n" + "\n\n---\n\n".join(text for _, text in events)
