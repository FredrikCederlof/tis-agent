"""Tests for calendar day-kind / students-in-session classification."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from tis_agent.ask import (
    Evidence,
    format_is_school_day_reply,
    format_no_school_days_reply,
)
from tis_agent.day_kind import (
    DAY_KIND_HOLIDAY,
    DAY_KIND_NO_STUDENT,
    DAY_KIND_SPECIAL,
    classify_calendar_event,
)
from tis_agent.ical_text import events_to_chunks, parse_ics_events
from tis_agent.temporal import parse_temporal


TOKYO = ZoneInfo("Asia/Tokyo")
TODAY = date(2026, 8, 28)


def test_pd_day_is_no_student():
    impact = classify_calendar_event("Professional Development For Staff (No Student Day)")
    assert impact.day_kind == DAY_KIND_NO_STUDENT
    assert impact.students_in_session is False


def test_japanese_holiday_is_holiday():
    impact = classify_calendar_event("School Holiday (Japanese Holiday)")
    assert impact.day_kind == DAY_KIND_HOLIDAY
    assert impact.students_in_session is False


def test_no_number_day_is_still_school():
    impact = classify_calendar_event("No Number Day")
    assert impact.day_kind == DAY_KIND_SPECIAL
    assert impact.students_in_session is True


def test_ics_chunks_carry_day_kind():
    ics = """BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260922
DTEND;VALUE=DATE:20260923
SUMMARY:Professional Development For Staff (No Student Day)
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260922
DTEND;VALUE=DATE:20260923
SUMMARY:No Number Day
END:VEVENT
END:VCALENDAR
"""
    events, _, _ = parse_ics_events(
        ics,
        now=datetime(2026, 8, 28, 12, 0, tzinfo=TOKYO),
    )
    chunks = events_to_chunks(events)
    by_title = {c.section_title: c for c in chunks}
    assert by_title["Professional Development For Staff (No Student Day)"].event_type == DAY_KIND_NO_STUDENT
    assert "Students in session: no" in by_title["Professional Development For Staff (No Student Day)"].content
    assert by_title["No Number Day"].event_type == DAY_KIND_SPECIAL
    assert "Students in session: yes" in by_title["No Number Day"].content


def test_list_no_school_days_excludes_no_number_day():
    temporal = parse_temporal(
        "list all days in September where kids are off from school",
        today=TODAY,
    )
    assert temporal.schedule_intent == "list_no_school_days"
    assert temporal.date_range is not None
    assert temporal.date_range.start == date(2026, 9, 1)

    evidence = [
        Evidence(
            content="Event: School Holiday (Japanese Holiday)\nStudents in session: no",
            section_title="School Holiday (Japanese Holiday)",
            page_start=1,
            page_end=1,
            document_title="TIS Parent Calendar",
            similarity=0.99,
            source_type="calendar",
            start_date=date(2026, 9, 21),
            end_date=date(2026, 9, 21),
            event_type=DAY_KIND_HOLIDAY,
        ),
        Evidence(
            content="Event: Professional Development For Staff (No Student Day)\nStudents in session: no",
            section_title="Professional Development For Staff (No Student Day)",
            page_start=1,
            page_end=1,
            document_title="TIS Parent Calendar",
            similarity=0.99,
            source_type="calendar",
            start_date=date(2026, 9, 22),
            end_date=date(2026, 9, 22),
            event_type=DAY_KIND_NO_STUDENT,
        ),
        Evidence(
            content="Event: No Number Day\nStudents in session: yes",
            section_title="No Number Day",
            page_start=1,
            page_end=1,
            document_title="TIS Parent Calendar",
            similarity=0.99,
            source_type="calendar",
            start_date=date(2026, 9, 22),
            end_date=date(2026, 9, 22),
            event_type=DAY_KIND_SPECIAL,
        ),
    ]
    reply = format_no_school_days_reply(evidence, temporal, "en")
    assert "School Holiday" in reply
    assert "Professional Development" in reply
    assert "No Number Day" not in reply


def test_is_school_day_weekend():
    temporal = parse_temporal("Is it school tomorrow?", today=TODAY)  # Fri → Sat
    assert temporal.schedule_intent == "is_school_day"
    assert temporal.date_range == temporal.date_range  # noqa: PLR0124 — sanity
    assert temporal.date_range is not None
    assert temporal.date_range.start == date(2026, 8, 29)
    reply = format_is_school_day_reply([], temporal, "en")
    assert "weekend" in reply.lower()


def test_is_school_day_pd():
    temporal = parse_temporal("Is it school on the 22nd of September?", today=TODAY)
    assert temporal.schedule_intent == "is_school_day"
    evidence = [
        Evidence(
            content="Event: Professional Development For Staff (No Student Day)\nStudents in session: no",
            section_title="Professional Development For Staff (No Student Day)",
            page_start=1,
            page_end=1,
            document_title="TIS Parent Calendar",
            similarity=0.99,
            source_type="calendar",
            start_date=date(2026, 9, 22),
            end_date=date(2026, 9, 22),
            event_type=DAY_KIND_NO_STUDENT,
        )
    ]
    reply = format_is_school_day_reply(evidence, temporal, "en")
    assert reply.startswith("No school on")
    assert "professional development" in reply.lower()
    assert "students do not have school" not in reply
    assert "long weekend" not in reply


def test_is_school_day_monday_pd_is_a_long_weekend():
    temporal = parse_temporal("Is it school on the 7th of September?", today=TODAY)
    assert temporal.schedule_intent == "is_school_day"
    assert temporal.date_range is not None
    assert temporal.date_range.start == date(2026, 9, 7)
    evidence = [
        Evidence(
            content="Event: Professional Development For Staff (No Student Day)\nStudents in session: no",
            section_title="Professional Development For Staff (No Student Day)",
            page_start=1,
            page_end=1,
            document_title="TIS Parent Calendar",
            similarity=0.99,
            source_type="calendar",
            start_date=date(2026, 9, 7),
            end_date=date(2026, 9, 7),
            event_type=DAY_KIND_NO_STUDENT,
        )
    ]
    reply = format_is_school_day_reply(evidence, temporal, "en")
    assert "No school on Monday, September 7" in reply
    assert "professional development day" in reply
    assert "long weekend" in reply
    assert reply.count("😊") == 1
