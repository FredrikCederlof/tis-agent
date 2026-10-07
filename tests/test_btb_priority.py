"""Beyond the Bell questions pin the programme guide ahead of the calendar."""

from tis_agent.ask import (
    Evidence,
    _normalize_retrieval_query,
    is_beyond_the_bell_question,
    pin_topic_guide,
)


def _ev(**kwargs) -> Evidence:
    defaults = dict(
        content="calendar event",
        section_title=None,
        page_start=1,
        page_end=1,
        document_title="TIS Parent Calendar",
        similarity=0.9,
        chunk_id="cal-1",
        source_type="calendar",
    )
    defaults.update(kwargs)
    return Evidence(**defaults)


def test_detects_beyond_the_bell_and_btb():
    assert is_beyond_the_bell_question("How do you cancel beyond the bell same day?")
    assert is_beyond_the_bell_question("Is BtB open after school?")
    assert is_beyond_the_bell_question("beyond bell cancellation")
    assert not is_beyond_the_bell_question("What time does the late bus leave?")


def test_query_expansion_names_the_guide():
    out = _normalize_retrieval_query("How do you cancel beyond the bell same day?")
    assert "TIS Beyond the Bell Guide" in out
    assert "cancellations" in out


def test_guide_is_placed_ahead_of_calendar_and_deduped():
    calendar = _ev()
    bulletin = _ev(
        content="weekly note",
        document_title="TIS Weekly Bulletin",
        source_type="bulletin",
        chunk_id="bul-1",
        similarity=0.8,
    )
    guide_from_search = _ev(
        content="short overlap",
        document_title="TIS Beyond the Bell Guide 2026-27",
        source_type="document",
        chunk_id="guide-1",
        similarity=0.41,
    )
    guide = [
        _ev(
            content="Cancellations must be made by 2:30 PM on the day of care.",
            document_title="TIS Beyond the Bell Guide 2026-27",
            source_type="document",
            chunk_id="guide-1",
            similarity=0.85,
        ),
        _ev(
            content="Daily bookings via SchoolsBuddy by noon.",
            document_title="TIS Beyond the Bell Guide 2026-27",
            source_type="document",
            chunk_id="guide-2",
            similarity=0.85,
        ),
    ]
    pinned = pin_topic_guide([calendar, guide_from_search, bulletin], guide)
    assert [item.chunk_id for item in pinned] == ["guide-1", "guide-2", "cal-1", "bul-1"]
    assert "2:30 PM" in pinned[0].content


def test_empty_guide_leaves_evidence_unchanged():
    calendar = _ev()
    assert pin_topic_guide([calendar], []) == [calendar]
