"""Tests for retrieval query synonym expansion."""

from tis_agent.ask import _normalize_retrieval_query


def test_health_office_expands_to_school_nurse():
    out = _normalize_retrieval_query("Health Office contacts")
    lower = out.lower()
    assert "health office" in lower
    assert "school nurse" in lower
    assert "medical staff" in lower


def test_nurse_room_expands_to_school_nurse():
    out = _normalize_retrieval_query("nurse room email")
    assert "school nurse" in out.lower()


def test_absence_question_unchanged_aside_from_strip():
    q = "How do I report an absence?"
    assert _normalize_retrieval_query(q) == q
