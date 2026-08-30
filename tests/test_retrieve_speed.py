"""Tests for INS-7 retrieval speed helpers."""

from datetime import date
from unittest.mock import MagicMock, patch

from tis_agent.ask import (
    VECTOR_EXPAND_SIMILARITY,
    Evidence,
    _vector_retrieve,
    use_calendar_fast_path,
)
from tis_agent.temporal import TemporalQuery, DateRange, parse_temporal


def test_whats_on_today_uses_calendar_fast_path():
    temporal = parse_temporal("What's happening today?", today=date(2026, 8, 30))
    assert use_calendar_fast_path(temporal)


def test_is_school_day_uses_calendar_fast_path():
    temporal = parse_temporal("Is it a school day on 22 September?", today=date(2026, 8, 30))
    assert use_calendar_fast_path(temporal)


def test_list_no_school_days_uses_calendar_fast_path():
    temporal = parse_temporal("Student free days in September", today=date(2026, 8, 30))
    assert use_calendar_fast_path(temporal)


def test_handbook_question_does_not_use_calendar_fast_path():
    temporal = parse_temporal("How do I report an absence?", today=date(2026, 8, 30))
    assert temporal.kind == "none"
    assert not use_calendar_fast_path(temporal)


def test_event_date_lookup_does_not_use_calendar_fast_path():
    temporal = TemporalQuery(
        kind="event_date_lookup",
        original="When is Sports Day?",
        schedule_intent="none",
    )
    assert not use_calendar_fast_path(temporal)


def test_vector_retrieve_starts_with_one_query_and_skips_expand_when_strong():
    settings = MagicMock()
    settings.embedding_model = "text-embedding-3-small"
    settings.handbook_title = "Handbook"
    strong = [
        Evidence(
            content="absence policy",
            section_title=None,
            page_start=1,
            page_end=1,
            document_title="Handbook",
            similarity=0.72,
        )
    ]
    with patch("tis_agent.ask._vector_retrieve_once", side_effect=[strong]) as once:
        out = _vector_retrieve(
            settings,
            ["How do I report an absence?", "absence TIS handbook"],
            match_count=8,
        )
    assert out == strong
    once.assert_called_once_with(settings, ["How do I report an absence?"], match_count=8)


def test_vector_retrieve_expands_second_query_when_weak():
    settings = MagicMock()
    settings.embedding_model = "text-embedding-3-small"
    settings.handbook_title = "Handbook"
    weak = [
        Evidence(
            content="unrelated",
            section_title=None,
            page_start=1,
            page_end=1,
            document_title="Handbook",
            similarity=VECTOR_EXPAND_SIMILARITY - 0.1,
        )
    ]
    extra = [
        Evidence(
            content="better match",
            section_title=None,
            page_start=2,
            page_end=2,
            document_title="Handbook",
            similarity=0.55,
            chunk_id="extra-1",
        )
    ]
    with patch("tis_agent.ask._vector_retrieve_once", side_effect=[weak, extra]) as once:
        out = _vector_retrieve(
            settings,
            ["odd phrasing", "second query"],
            match_count=8,
        )
    assert once.call_count == 2
    assert len(out) == 2
    assert {item.content for item in out} == {"unrelated", "better match"}
