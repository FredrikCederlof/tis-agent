"""TRMNL dashboard payload, redaction, and read-only query shape."""

from datetime import datetime, timezone
from types import SimpleNamespace

from tis_agent.trmnl_dashboard import (
    build_dashboard_payload,
    coverage_percent,
    format_time_saved,
    load_dashboard,
    sanitize_question,
    tokyo_coverage_start,
    tokyo_day_start,
    trmnl_authorized,
)
from tis_agent.temporal import SCHOOL_TZ

NOW = datetime(2026, 10, 8, 14, 0, tzinfo=SCHOOL_TZ)


def test_coverage_matches_admin_success_rate():
    assert tokyo_coverage_start(NOW).isoformat(timespec="seconds") == "2026-10-02T00:00:00+09:00"
    assert coverage_percent(4, 1) == 80
    assert coverage_percent(0, 0) == 0
    assert format_time_saved(0) == "0m"
    assert format_time_saved(20) == "20m"
    assert format_time_saved(60) == "1h"
    assert format_time_saved(80) == "1h 20m"
    assert format_time_saved(14 * 60) == "14h"


def test_tokyo_day_starts_at_local_midnight():
    # 15:30 UTC is 00:30 the next calendar day in Tokyo.
    moment = datetime(2026, 10, 7, 15, 30, tzinfo=timezone.utc)
    start = tokyo_day_start(moment)
    assert start.isoformat(timespec="seconds") == "2026-10-08T00:00:00+09:00"
    assert tokyo_day_start(NOW).isoformat(timespec="seconds") == "2026-10-08T00:00:00+09:00"


def test_sanitize_redacts_contact_details_and_keeps_dates():
    text = (
        "Email me at parent@example.com or call +81 90 1234 5678 "
        "or 090-1234-5678 about the trip on 2026-10-08."
    )
    cleaned = sanitize_question(text)
    assert "parent@example.com" not in cleaned
    assert "1234" not in cleaned
    assert "2026-10-08" in cleaned
    assert "[redacted]" in cleaned


def test_sanitize_truncates_long_questions():
    cleaned = sanitize_question("word " * 80)
    assert len(cleaned) <= 140
    assert cleaned.endswith("…")


def test_empty_dashboard():
    payload = build_dashboard_payload(
        needs_attention=0,
        unanswered=0,
        new_today=0,
        latest=None,
        now=NOW,
    )
    assert payload["metrics"] == {
        "needs_attention": 0,
        "unanswered": 0,
        "new_today": 0,
        "knowledge_coverage": 0,
        "time_saved": "0m",
    }
    assert payload["latest_question"] is None
    assert payload["header_date"] == "Thu 8 Oct"
    assert payload["updated_label"] == "Last updated 14:00"
    assert payload["timezone"] == "Asia/Tokyo"
    assert payload["last_updated"] == "2026-10-08T14:00:00+09:00"


def test_latest_question_uses_tokyo_time_and_outcome_label():
    payload = build_dashboard_payload(
        needs_attention=1,
        unanswered=2,
        new_today=3,
        latest={
            "question": "What time does the bus leave?",
            "outcome": "no_evidence",
            "created_at": "2026-10-08T04:42:00+00:00",
            "wa_from": "819012345678",
        },
        now=NOW,
    )
    latest = payload["latest_question"]
    assert latest["text"] == "What time does the bus leave?"
    assert latest["meta"] == "Unanswered · 13:42"
    assert latest["created_at"] == "2026-10-08T13:42:00+09:00"
    assert "wa_from" not in latest
    assert "819012345678" not in str(payload)


class _Scripted:
    def __init__(self, responses: list[tuple[list[dict] | None, int | None]]):
        self._responses = list(responses)
        self.calls: list[tuple[str, str, dict]] = []

    def table(self, name: str) -> "_Query":
        return _Query(self, name)


class _Query:
    def __init__(self, parent: _Scripted, name: str):
        self.parent = parent
        self.name = name
        self.columns = ""
        self.kwargs: dict = {}

    def select(self, columns: str, **kwargs):
        self.columns = columns
        self.kwargs = kwargs
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def is_(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        self.parent.calls.append((self.name, self.columns, self.kwargs))
        data, count = self.parent._responses.pop(0)
        return SimpleNamespace(data=data, count=count)


def test_load_dashboard_selects_no_identifiers():
    client = _Scripted(
        [
            ([], 4),
            ([], 2),
            ([], 17),
            ([], 4),
            ([], 1),
            ([], 16),
            ([{"minutes_saved_per_question": 5}], None),
            (
                [
                    {
                        "question": "Bus time?",
                        "outcome": "success",
                        "created_at": "2026-10-08T04:42:00+00:00",
                    }
                ],
                None,
            ),
        ]
    )
    payload = load_dashboard(client, NOW)
    assert payload["metrics"] == {
        "needs_attention": 4,
        "unanswered": 2,
        "new_today": 17,
        "knowledge_coverage": 80,
        "time_saved": "1h 20m",
    }
    assert payload["latest_question"]["meta"] == "Answered · 13:42"
    latest_call = client.calls[-1]
    assert latest_call[0] == "interactions"
    assert "wa_from" not in latest_call[1]
    assert "session_id" not in latest_call[1]
    assert "reply" not in latest_call[1]
    assert "wa_message_id" not in latest_call[1]
    assert client.calls[0][0] == "unanswered_interactions"
    assert client.calls[1][0] == "unanswered_interactions"
    assert client.calls[6][0] == "agent_config"
    assert client.calls[6][1] == "minutes_saved_per_question"
    assert "question_en" in latest_call[1]
    assert all(call[2].get("count") == "exact" and call[2].get("head") is True for call in client.calls[:6])


def test_trmnl_auth():
    assert trmnl_authorized("Bearer secret-key", "secret-key") is True
    assert trmnl_authorized("Bearer wrong", "secret-key") is False
    assert trmnl_authorized(None, "secret-key") is False
    assert trmnl_authorized("Bearer secret-key", "") is False
    assert trmnl_authorized("Bearer secret-key", None) is False


def test_route_requires_bearer_token():
    import os
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from tis_agent.whatsapp import app

    os.environ.pop("TRMNL_API_KEY", None)
    client = TestClient(app)
    avatar = client.get("/trmnl/tina.png")
    assert avatar.status_code == 200
    assert avatar.headers["content-type"].startswith("image/png")

    missing = client.get("/trmnl/dashboard")
    assert missing.status_code == 503

    os.environ["TRMNL_API_KEY"] = "test-key"
    try:
        rejected = client.get("/trmnl/dashboard", headers={"Authorization": "Bearer nope"})
        assert rejected.status_code == 403
        with patch(
            "tis_agent.trmnl_dashboard.load_dashboard_from_env",
            return_value={"metrics": {"needs_attention": 0, "unanswered": 0, "new_today": 0}},
        ):
            accepted = client.get(
                "/trmnl/dashboard",
                headers={"Authorization": "Bearer test-key"},
            )
        assert accepted.status_code == 200
        assert accepted.json()["metrics"]["unanswered"] == 0
    finally:
        os.environ.pop("TRMNL_API_KEY", None)
