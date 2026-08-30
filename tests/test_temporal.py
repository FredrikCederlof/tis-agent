"""Tests for temporal query parsing, date overlap, and calendar event chunks."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from tis_agent.ask import (
    EVENT_LOOKUP_SIMILARITY_FLOOR,
    Evidence,
    _is_temporally_relevant,
    _passes_grounding,
    _rerank,
    format_schedule_reply,
)
from tis_agent.ical_text import events_to_chunks, inclusive_end, parse_ics_events
from tis_agent.temporal import (
    chunk_overlaps_range,
    is_sync_window_stub,
    is_whats_on_question,
    parse_temporal,
    retrieval_queries,
    school_week,
)


TODAY = date(2026, 8, 28)  # Friday in Tokyo
TOKYO = ZoneInfo("Asia/Tokyo")


class _Config:
    similarity_threshold = 0.40


def _q(text: str):
    return parse_temporal(text, today=TODAY)


def test_this_week_is_monday_to_friday():
    rng = school_week(TODAY)
    assert rng.start == date(2026, 8, 24)
    assert rng.end == date(2026, 8, 28)
    parsed = _q("Are there any events this week?")
    assert parsed.kind == "date_anchored"
    assert parsed.date_range.start == date(2026, 8, 24)
    assert parsed.date_range.end == date(2026, 8, 28)


def test_next_week_is_following_monday_to_friday():
    parsed = _q("Are there any events next week?")
    assert parsed.date_range.start == date(2026, 8, 31)
    assert parsed.date_range.end == date(2026, 9, 4)


def test_relative_days():
    assert _q("What's happening today?").date_range.start == TODAY
    assert _q("Anything special tomorrow?").date_range.start == date(2026, 8, 29)
    assert _q("Vad händer idag?").date_range.start == TODAY


def test_greeting_today_is_date_anchored_whats_on():
    question = "Hi. Is there anything special happening at school today?"
    parsed = _q(question)
    assert parsed.kind == "date_anchored"
    assert parsed.date_range.start == TODAY
    assert parsed.date_range.end == TODAY
    assert is_whats_on_question(question)
    assert is_whats_on_question("What's happening today?")
    assert is_whats_on_question("Vad händer idag?")
    assert not is_whats_on_question("When should I report an absence?")


def test_weekend_is_saturday_sunday():
    parsed = _q("What do we have this weekend?")
    assert parsed.date_range.start == date(2026, 8, 29)
    assert parsed.date_range.end == date(2026, 8, 30)


def test_next_thursday():
    parsed = _q("What's happening next Thursday?")
    assert parsed.kind == "date_anchored"
    assert parsed.date_range.start == date(2026, 9, 3)
    assert parsed.date_range.end == date(2026, 9, 3)


def test_absolute_date():
    parsed = _q("What happens on September 17?")
    assert parsed.kind == "date_anchored"
    assert parsed.date_range.start == date(2026, 9, 17)


def test_in_two_weeks_is_that_school_week():
    parsed = _q("Anything in two weeks?")
    # today + 14 days = 11 Sep 2026 (Friday) → that Mon–Fri
    assert parsed.date_range.start == date(2026, 9, 7)
    assert parsed.date_range.end == date(2026, 9, 11)


def test_when_is_named_event():
    parsed = _q("When is Sports Day?")
    assert parsed.kind == "event_date_lookup"
    assert parsed.date_range is None


def test_procedural_when_is_not_temporal():
    parsed = _q("When should I report an absence?")
    assert parsed.kind == "none"


def test_rewrite_includes_iso_date():
    parsed = _q("What's happening tomorrow?")
    queries = retrieval_queries(parsed)
    assert any("2026-08-29" in q for q in queries)
    assert queries[0] == "What's happening tomorrow?"


def test_wrong_date_is_not_relevant():
    rng = _q("What happens on September 17?").date_range
    wrong = "Event: Sports Day\nStarts: 2026-09-16 (all day)"
    right = "Event: Sports Day\nStarts: 2026-09-17 (all day)"
    assert not chunk_overlaps_range(wrong, rng)
    assert chunk_overlaps_range(right, rng)


def test_metadata_overlap_preferred():
    rng = _q("What happens on September 17?").date_range
    content = "Event: Concert\nStarts: 2026-09-17 (all day)"
    assert chunk_overlaps_range(
        content, rng, start_date=date(2026, 9, 17), end_date=date(2026, 9, 17)
    )
    assert not chunk_overlaps_range(
        content, rng, start_date=date(2026, 9, 16), end_date=date(2026, 9, 16)
    )


def test_evidence_filter_drops_wrong_day():
    temporal = _q("What happens on September 17?")
    wrong = Evidence(
        content="Event: Assembly\nStarts: 2026-09-16 (all day)",
        section_title="Assembly",
        page_start=1,
        page_end=1,
        document_title="TIS Parent Calendar",
        similarity=0.9,
        source_type="calendar",
        start_date=date(2026, 9, 16),
        end_date=date(2026, 9, 16),
    )
    right = Evidence(
        content="Event: Sports Day\nStarts: 2026-09-17 (all day)",
        section_title="Sports Day",
        page_start=1,
        page_end=1,
        document_title="TIS Parent Calendar",
        similarity=0.35,
        source_type="calendar",
        start_date=date(2026, 9, 17),
        end_date=date(2026, 9, 17),
    )
    assert not _is_temporally_relevant(wrong, temporal)
    assert _is_temporally_relevant(right, temporal)
    assert _passes_grounding([right], temporal, _Config())


def test_low_cosine_calendar_lookup_can_pass():
    temporal = _q("When is Sports Day?")
    item = Evidence(
        content="Event: Sports Day\nStarts: 2026-09-17 (all day)",
        section_title="Sports Day",
        page_start=1,
        page_end=1,
        document_title="TIS Parent Calendar",
        similarity=EVENT_LOOKUP_SIMILARITY_FLOOR,
        source_type="calendar",
        start_date=date(2026, 9, 17),
        end_date=date(2026, 9, 17),
    )
    assert _passes_grounding([item], temporal, _Config())


def test_all_day_exclusive_dtend():
    start = date(2026, 9, 17)
    end = date(2026, 9, 18)
    assert inclusive_end(start, end) == date(2026, 9, 17)


def test_ics_one_chunk_per_event():
    raw = """BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260917
DTEND;VALUE=DATE:20260918
SUMMARY:Sports Day
DESCRIPTION:Whole school
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260916
DTEND;VALUE=DATE:20260917
SUMMARY:Assembly
END:VEVENT
END:VCALENDAR
"""
    now = datetime(2026, 8, 28, 10, 0, tzinfo=TOKYO)
    events, _, _ = parse_ics_events(raw, now=now)
    assert [e.summary for e in events] == ["Assembly", "Sports Day"]
    chunks = events_to_chunks(events)
    sports = next(c for c in chunks if c.section_title == "Sports Day")
    assert sports.start_date == date(2026, 9, 17)
    assert sports.end_date == date(2026, 9, 17)
    assert "2026-09-17" in sports.content
    assert "Assembly" not in sports.content


def test_all_day_today_is_kept_after_noon():
    raw = """BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260828
DTEND;VALUE=DATE:20260829
SUMMARY:Hope and Dreams
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260828
DTEND;VALUE=DATE:20260829
SUMMARY:No Number Day
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260827
DTEND;VALUE=DATE:20260828
SUMMARY:Yesterday
END:VEVENT
END:VCALENDAR
"""
    now = datetime(2026, 8, 28, 18, 14, tzinfo=TOKYO)
    events, window_start, _ = parse_ics_events(raw, now=now)
    assert window_start == date(2026, 8, 28)
    assert {e.summary for e in events} == {"Hope and Dreams", "No Number Day"}


def test_tis_times_empty_window_is_not_today_evidence():
    stub = (
        "TIS Times (Parent Portal)\n"
        "No posts dated between 2026-08-28 and 2026-09-27.\n"
    )
    temporal = _q("Anything special happening at school today?")
    item = Evidence(
        content=stub,
        section_title=None,
        page_start=1,
        page_end=1,
        document_title="TIS Times (Parent Portal)",
        similarity=0.92,
        source_type="web",
        start_date=date(2026, 8, 28),
        end_date=date(2026, 9, 27),
    )
    assert is_sync_window_stub(stub, document_title=item.document_title)
    assert not _is_temporally_relevant(item, temporal)
    assert not chunk_overlaps_range(
        stub,
        temporal.date_range,
        start_date=item.start_date,
        end_date=item.end_date,
        document_title=item.document_title,
    )


def test_empty_calendar_is_a_real_today_answer():
    temporal = _q("Hi. Is there anything special happening at school today?")
    reply = format_schedule_reply([], temporal, "en")
    assert "Nothing special on the parent calendar" in reply
    assert "Friday" in reply
    assert "28" in reply
    assert "TIS Parent Calendar" in reply
    assert "couldn't find" not in reply.lower()


def test_schedule_reply_lists_todays_events():
    temporal = _q("What's happening today?")
    events = [
        Evidence(
            content="Event: Hopes and Dreams\nStarts: 2026-08-28 (all day)",
            section_title="Hopes and Dreams",
            page_start=1,
            page_end=1,
            document_title="TIS Parent Calendar",
            similarity=0.99,
            source_type="calendar",
            start_date=date(2026, 8, 28),
            end_date=date(2026, 8, 28),
        ),
        Evidence(
            content="Event: Assembly\nStarts: 2026-08-28 08:30 JST",
            section_title="Assembly",
            page_start=1,
            page_end=1,
            document_title="TIS Parent Calendar",
            similarity=0.99,
            source_type="calendar",
            start_date=date(2026, 8, 28),
            end_date=date(2026, 8, 28),
        ),
    ]
    reply = format_schedule_reply(events, temporal, "en")
    assert "Hopes and Dreams" in reply
    assert "Assembly (08:30)" in reply
    assert "Here's what's on today" in reply


def test_calendar_ranks_above_portal_for_date_questions():
    temporal = _q("What's happening today?")
    portal = Evidence(
        content="TIS Times article about next month's bake sale.",
        section_title="Bake sale",
        page_start=1,
        page_end=1,
        document_title="TIS Times (Parent Portal)",
        similarity=0.8,
        source_type="web",
        start_date=date(2026, 8, 28),
        end_date=date(2026, 8, 28),
    )
    calendar = Evidence(
        content="Event: Assembly\nStarts: 2026-08-28 (all day)",
        section_title="Assembly",
        page_start=1,
        page_end=1,
        document_title="TIS Parent Calendar",
        similarity=0.4,
        source_type="calendar",
        start_date=date(2026, 8, 28),
        end_date=date(2026, 8, 28),
    )
    ranked = _rerank([portal, calendar], temporal)
    assert ranked[0].source_type == "calendar"
    assert ranked[0].section_title == "Assembly"


def test_calendar_content_hash_changes_with_parser_version():
    from tis_agent.ical_text import ICAL_CHUNK_VERSION
    from tis_agent.ingest_document import content_hash

    ics = b"BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR"
    plain = content_hash(ics)
    salted = content_hash(ics, salt=ICAL_CHUNK_VERSION)
    assert plain != salted
    assert salted == content_hash(ics, salt=ICAL_CHUNK_VERSION)
