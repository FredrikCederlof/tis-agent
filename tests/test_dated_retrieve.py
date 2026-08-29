"""Tests for dated retrieval across calendar + handbook/bulletin/web."""

from datetime import date

from tis_agent.ask import (
    Evidence,
    format_schedule_reply,
    has_non_calendar_context,
    is_rotation_day,
    is_school_start_question,
    select_dated_evidence,
)
from tis_agent.temporal import parse_temporal


TODAY = date(2026, 8, 28)


def _q(text: str):
    return parse_temporal(text, today=TODAY)


def _ev(**kwargs) -> Evidence:
    defaults = dict(
        content="",
        section_title=None,
        page_start=1,
        page_end=1,
        document_title="Community Handbook 2026-2027",
        similarity=0.5,
        source_type="handbook",
        start_date=None,
        end_date=None,
    )
    defaults.update(kwargs)
    return Evidence(**defaults)


def test_rotation_day_is_not_a_special_event():
    item = _ev(
        content="Event: Day 3\nStarts: 2026-08-28 (all day)",
        section_title="Day 3",
        document_title="TIS Parent Calendar",
        source_type="calendar",
        start_date=TODAY,
        end_date=TODAY,
        similarity=0.99,
    )
    assert is_rotation_day(item)
    reply = format_schedule_reply([item], _q("What's happening today?"), "en")
    assert "doesn't list a special event" in reply
    assert "Day 3" not in reply


def test_select_dated_evidence_keeps_bulletin_about_todays_event():
    temporal = _q("Hi. Is there anything special happening at school today?")
    calendar = _ev(
        content="Event: Hope and Dreams\nStarts: 2026-08-28 (all day)",
        section_title="Hope and Dreams",
        document_title="TIS Parent Calendar",
        source_type="calendar",
        start_date=TODAY,
        end_date=TODAY,
        similarity=0.4,
    )
    bulletin = _ev(
        content=(
            "Hopes and Dreams conferences take place on Friday 28 August. "
            "There is no school for students that day."
        ),
        section_title=None,
        document_title="TIS Weekly Bulletin 2026-08-28",
        source_type="bulletin",
        similarity=0.55,
        start_date=TODAY,
        end_date=TODAY,
    )
    handbook = _ev(
        content="If your child is going to be absent, submit an attendance excusal on Toddle.",
        document_title="Community Handbook 2026-2027",
        source_type="handbook",
        similarity=0.7,
    )
    selected = select_dated_evidence([handbook, bulletin, calendar], temporal)
    titles = {item.document_title for item in selected}
    assert "TIS Parent Calendar" in titles
    assert "TIS Weekly Bulletin 2026-08-28" in titles
    assert "Community Handbook 2026-2027" not in titles
    assert has_non_calendar_context(selected)


def test_undated_handbook_included_when_it_names_todays_event():
    temporal = _q("What's happening today?")
    calendar = _ev(
        content="Event: Hope and Dreams\nStarts: 2026-08-28 (all day)",
        section_title="Hope and Dreams",
        document_title="TIS Parent Calendar",
        source_type="calendar",
        start_date=TODAY,
        end_date=TODAY,
        similarity=0.99,
    )
    handbook = _ev(
        content=(
            "Hope & Dreams is a conference between parents and homeroom teachers. "
            "Students do not attend school on Hopes and Dreams day."
        ),
        document_title="Community Handbook 2026-2027",
        source_type="handbook",
        similarity=0.45,
    )
    selected = select_dated_evidence([calendar, handbook], temporal)
    assert any(item.source_type == "handbook" for item in selected)
    assert has_non_calendar_context(selected)


def test_bulletin_with_todays_date_is_kept_without_calendar() -> None:
    temporal = _q("What's happening today?")
    bulletin = _ev(
        content="Hopes and Dreams conferences are Friday 28 August in homeroom.",
        document_title="TIS Weekly Bulletin 2026-08-28",
        source_type="bulletin",
        similarity=0.6,
        start_date=TODAY,
        end_date=TODAY,
    )
    selected = select_dated_evidence([bulletin], temporal)
    assert selected
    assert selected[0].source_type == "bulletin"
    assert has_non_calendar_context(selected)


def test_school_start_question_is_detected() -> None:
    assert is_school_start_question("What time does school start?")
    assert not is_school_start_question("What time is Hope and Dreams?")
