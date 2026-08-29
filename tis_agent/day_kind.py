"""Classify TIS calendar events by student attendance impact."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Stored in chunks.event_type for calendar rows.
DAY_KIND_HOLIDAY = "holiday"
DAY_KIND_NO_STUDENT = "no_student_day"
DAY_KIND_SPECIAL = "special_event"
DAY_KIND_ROTATION = "rotation_day"
DAY_KIND_OTHER = "calendar_event"

_NO_STUDENT_RE = re.compile(
    r"(?i)\b(?:"
    r"no\s+student\s+day|"
    r"no\s+students?\s+day|"
    r"students?\s+do\s+not\s+attend|"
    r"no\s+school\s+for\s+students|"
    r"professional\s+development|"
    r"\bpd\s+day\b|"
    r"staff\s+(?:only|pd|professional)"
    r")\b"
)
_HOLIDAY_RE = re.compile(
    r"(?i)\b(?:"
    r"school\s+holiday|"
    r"japanese\s+holiday|"
    r"national\s+holiday|"
    r"public\s+holiday|"
    r"holiday\s*\(|"
    r"winter\s+break|"
    r"spring\s+break|"
    r"summer\s+break|"
    r"autumn\s+break|"
    r"fall\s+break|"
    r"golden\s+week"
    r")\b"
)
_ROTATION_RE = re.compile(r"(?i)^day\s*[1-6]$")
# Special days that still have school unless the title also says no students.
_IN_SESSION_SPECIAL_RE = re.compile(
    r"(?i)\b(?:"
    r"no\s+number\s+day|"
    r"hopes?\s*(?:and|&)\s*dreams|"
    r"assembly|"
    r"back\s+to\s+school|"
    r"orientation|"
    r"open\s+house|"
    r"concert|"
    r"sports\s+day|"
    r"field\s+day"
    r")\b"
)


@dataclass(frozen=True)
class DayImpact:
    day_kind: str
    students_in_session: bool | None
    """True = school for students; False = no school for students; None = unknown."""


def classify_calendar_event(summary: str, description: str = "") -> DayImpact:
    """Deterministic label for Parent Calendar event titles."""
    title = (summary or "").strip()
    blob = f"{title}\n{description or ''}"
    title_only = title

    if re.search(r"(?i)students in session:\s*no\b", blob):
        return DayImpact(DAY_KIND_NO_STUDENT, False)
    if re.search(r"(?i)students in session:\s*yes\b", blob) and not _NO_STUDENT_RE.search(blob):
        if _ROTATION_RE.fullmatch(re.sub(r"\s+", " ", title_only)):
            return DayImpact(DAY_KIND_ROTATION, True)
        return DayImpact(DAY_KIND_SPECIAL, True)

    if _ROTATION_RE.fullmatch(re.sub(r"\s+", " ", title_only)):
        return DayImpact(DAY_KIND_ROTATION, True)

    # Explicit no-student / PD wins even if "No Number Day" appears elsewhere.
    if _NO_STUDENT_RE.search(blob):
        return DayImpact(DAY_KIND_NO_STUDENT, False)

    if _HOLIDAY_RE.search(blob):
        return DayImpact(DAY_KIND_HOLIDAY, False)

    if _IN_SESSION_SPECIAL_RE.search(blob):
        return DayImpact(DAY_KIND_SPECIAL, True)

    if title_only:
        return DayImpact(DAY_KIND_SPECIAL, True)
    return DayImpact(DAY_KIND_OTHER, None)


def students_off_kinds() -> frozenset[str]:
    return frozenset({DAY_KIND_HOLIDAY, DAY_KIND_NO_STUDENT})


def enrich_event_text(
    base_text: str,
    *,
    day_kind: str,
    students_in_session: bool | None,
) -> str:
    lines = [base_text.rstrip()]
    lines.append(f"Day kind: {day_kind}")
    if students_in_session is True:
        lines.append("Students in session: yes")
        lines.append("Students have school this day: yes")
    elif students_in_session is False:
        lines.append("Students in session: no")
        lines.append("Students have school this day: no")
        lines.append("This is a no-school / no-student day for students.")
    return "\n".join(lines)


def impact_from_event_type(event_type: str | None) -> DayImpact | None:
    if not event_type:
        return None
    if event_type in students_off_kinds():
        return DayImpact(event_type, False)
    if event_type == DAY_KIND_ROTATION:
        return DayImpact(event_type, True)
    if event_type in {DAY_KIND_SPECIAL, DAY_KIND_OTHER}:
        return DayImpact(event_type, True)
    return None


def impact_from_evidence_text(
    *,
    section_title: str | None,
    content: str,
    event_type: str | None = None,
) -> DayImpact:
    typed = impact_from_event_type(event_type)
    if typed is not None and event_type in students_off_kinds() | {DAY_KIND_ROTATION, DAY_KIND_SPECIAL}:
        return typed
    return classify_calendar_event(section_title or "", content or "")
