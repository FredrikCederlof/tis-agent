"""TRMNL dashboard payload, redaction, and read-only query shape."""

from datetime import datetime, timezone
from types import SimpleNamespace

from tis_agent.trmnl_dashboard import (
    attention_detail,
    build_dashboard_payload,
    choose_gap,
    coverage_percent,
    day_comparison,
    format_time_saved,
    gap_topic,
    load_dashboard,
    pp_detail,
    rate_percent,
    sanitize_question,
    tokyo_coverage_start,
    tokyo_day_start,
    tokyo_week_start,
    trmnl_authorized,
)
from tis_agent.temporal import SCHOOL_TZ

NOW = datetime(2026, 10, 8, 14, 0, tzinfo=SCHOOL_TZ)


def _payload(**overrides):
    values = dict(
        now=NOW,
        needs_attention=0,
        questions_today=0,
        questions_yesterday=0,
        answered_this_week=0,
        eligible_this_week=0,
        answered_last_week=0,
        eligible_last_week=0,
        coverage_grounded=0,
        coverage_gaps=0,
        previous_coverage_grounded=0,
        previous_coverage_gaps=0,
        minutes_each=5,
        latest=None,
        gap=None,
    )
    values.update(overrides)
    return build_dashboard_payload(**values)


def test_coverage_matches_admin_success_rate():
    assert tokyo_coverage_start(NOW).isoformat(timespec="seconds") == "2026-10-02T00:00:00+09:00"
    assert tokyo_week_start(NOW).isoformat(timespec="seconds") == "2026-10-05T00:00:00+09:00"
    assert coverage_percent(4, 1) == 80
    assert coverage_percent(0, 0) == 0
    assert rate_percent(0, 0) is None
    assert rate_percent(0, 4) == 0
    assert rate_percent(23, 25) == 92
    assert format_time_saved(0) == "0m"
    assert format_time_saved(45) == "45m"
    assert format_time_saved(60) == "1h"
    assert format_time_saved(90) == "1h 30m"
    assert format_time_saved(12 * 60 + 15) == "12h 15m"
    assert attention_detail(0) == "All caught up"
    assert attention_detail(2) == "Action required"
    assert attention_detail(None) == "Unavailable"
    assert day_comparison(3, 2) == "+1 vs yesterday"
    assert day_comparison(1, 3) == "−2 vs yesterday"
    assert day_comparison(2, 2) == "Same as yesterday"
    assert pp_detail(92, 88) == "+4 pp this week"
    assert pp_detail(80, 84) == "−4 pp this week"
    assert pp_detail(80, None) == "Not enough data"


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


def test_empty_dashboard_uses_fallbacks_not_fake_rates():
    payload = _payload()
    metrics = payload["metrics"]
    assert metrics["needs_attention"] == 0
    assert metrics["needs_attention_detail"] == "All caught up"
    assert metrics["questions_today"] == 0
    assert metrics["questions_today_detail"] == "Same as yesterday"
    assert metrics["answered_by_tina"] == "—"
    assert metrics["answered_by_tina_detail"] == "Not enough data"
    assert metrics["knowledge_coverage"] is None
    assert metrics["knowledge_coverage_label"] == "—"
    assert metrics["knowledge_coverage_detail"] == "Not enough data"
    assert metrics["time_saved"] == "0m"
    assert metrics["time_saved_detail"] == "This week"
    assert metrics["knowledge_gap"] == "No current gaps"
    assert payload["latest_activity"] is None
    assert payload["header_date"] == "Thu 8 Oct"
    assert payload["updated_label"] == "Updated 14:00"
    assert payload["timezone"] == "Asia/Tokyo"


def test_informative_dashboard_compares_weeks_and_hides_pii():
    long_question = (
        "What times are Beyond the Bell? Email parent@example.com or call "
        "+81 90 1234 5678 about the schedule for the rest of the term please."
    )
    payload = _payload(
        needs_attention=2,
        questions_today=3,
        questions_yesterday=2,
        answered_this_week=23,
        eligible_this_week=25,
        answered_last_week=22,
        eligible_last_week=25,
        coverage_grounded=86,
        coverage_gaps=14,
        previous_coverage_grounded=82,
        previous_coverage_gaps=18,
        minutes_each=5,
        latest={
            "question": "När är Beyond the Bell?",
            "question_en": long_question,
            "language": "sv",
            "outcome": "success",
            "created_at": "2026-10-08T09:43:00+00:00",
            "wa_from": "819012345678",
        },
        gap={
            "question": long_question,
            "question_en": "After-school transport for the Thursday bus",
            "outcome": "no_evidence",
            "manual_attention_at": None,
            "created_at": "2026-10-08T01:00:00+00:00",
            "wa_from": "819012345678",
        },
    )
    metrics = payload["metrics"]
    assert metrics["needs_attention_detail"] == "Action required"
    assert metrics["questions_today_detail"] == "+1 vs yesterday"
    assert metrics["answered_by_tina"] == "92%"
    assert metrics["answered_by_tina_detail"] == "+4 pp this week"
    assert metrics["knowledge_coverage"] == 86
    assert metrics["knowledge_coverage_label"] == "86%"
    assert metrics["knowledge_coverage_detail"] == "+4 pp this week"
    assert metrics["time_saved"] == "1h 55m"
    assert metrics["time_saved_detail"] == "This week"
    assert metrics["knowledge_gap"] == "After-school transport for the Thursday bus"
    activity = payload["latest_activity"]
    assert activity["text"].startswith("What times are Beyond the Bell?")
    assert "parent@example.com" not in activity["text"]
    assert "1234" not in activity["text"]
    assert len(activity["text"]) <= 90
    assert activity["text"].endswith("…")
    assert activity["meta"] == "SV · Answered · 18:43"
    assert "819012345678" not in str(payload)
    assert payload["latest_question"] == activity


def test_missing_config_and_failed_gap_do_not_invent_values():
    payload = _payload(
        answered_this_week=3,
        eligible_this_week=3,
        minutes_each=None,
        gap_failed=True,
        needs_attention=None,
        questions_today=None,
        questions_yesterday=4,
    )
    assert payload["metrics"]["time_saved"] == "—"
    assert payload["metrics"]["time_saved_detail"] == "Unavailable"
    assert payload["metrics"]["knowledge_gap"] == "—"
    assert payload["metrics"]["needs_attention_detail"] == "Unavailable"
    assert payload["metrics"]["questions_today_detail"] == "Unavailable"
    assert payload["metrics"]["answered_by_tina"] == "100%"


def test_gap_priority_prefers_manual_then_no_evidence():
    chosen = choose_gap(
        [
            {
                "question_en": "Newer low confidence",
                "outcome": "low_confidence",
                "manual_attention_at": None,
                "created_at": "2026-10-08T10:00:00+00:00",
            },
            {
                "question_en": "Older missing source",
                "outcome": "no_evidence",
                "manual_attention_at": None,
                "created_at": "2026-10-07T10:00:00+00:00",
            },
            {
                "question_en": "Flagged by hand",
                "outcome": "low_confidence",
                "manual_attention_at": "2026-10-06T10:00:00+00:00",
                "created_at": "2026-10-06T09:00:00+00:00",
            },
        ]
    )
    assert chosen["question_en"] == "Flagged by hand"
    flagged_only = choose_gap(chosen and [chosen])
    assert gap_topic(flagged_only) == "Flagged by hand"
    phone = gap_topic({"question_en": "Call +81 90 1234 5678 about the late bus"})
    assert "1234" not in phone
    assert gap_topic(None) == "No current gaps"


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

    def lt(self, *_args, **_kwargs):
        return self

    def neq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        self.parent.calls.append((self.name, self.columns, self.kwargs))
        item = self.parent._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        data, count = item
        return SimpleNamespace(data=data, count=count)


def test_load_dashboard_selects_no_identifiers():
    client = _Scripted(
        [
            ([], 2),
            ([], 3),
            ([], 2),
            ([], 25),
            ([], 23),
            ([], 25),
            ([], 22),
            ([], 86),
            ([], 14),
            ([], 82),
            ([], 18),
            ([{"minutes_saved_per_question": 5}], None),
            (
                [
                    {
                        "question": "Original",
                        "question_en": "Bus time?",
                        "language": "en",
                        "outcome": "success",
                        "created_at": "2026-10-08T04:42:00+00:00",
                    }
                ],
                None,
            ),
            (
                [
                    {
                        "question_en": "After-school transport",
                        "question": "secret original",
                        "outcome": "no_evidence",
                        "manual_attention_at": None,
                        "created_at": "2026-10-08T01:00:00+00:00",
                    }
                ],
                None,
            ),
        ]
    )
    payload = load_dashboard(client, NOW)
    metrics = payload["metrics"]
    assert metrics["needs_attention"] == 2
    assert metrics["questions_today"] == 3
    assert metrics["questions_today_detail"] == "+1 vs yesterday"
    assert metrics["answered_by_tina"] == "92%"
    assert metrics["answered_by_tina_detail"] == "+4 pp this week"
    assert metrics["knowledge_coverage_label"] == "86%"
    assert metrics["knowledge_coverage_detail"] == "+4 pp this week"
    assert metrics["time_saved"] == "1h 55m"
    assert metrics["knowledge_gap"] == "After-school transport"
    assert payload["latest_activity"]["meta"] == "EN · Answered · 13:42"
    assert client.calls[0][0] == "admin_session_list"
    assert client.calls[11][0] == "agent_config"
    assert client.calls[11][1] == "minutes_saved_per_question"
    latest_call = client.calls[12]
    gap_call = client.calls[13]
    assert latest_call[0] == "interactions"
    assert gap_call[0] == "unanswered_interactions"
    for columns in (latest_call[1], gap_call[1]):
        assert "wa_from" not in columns
        assert "session_id" not in columns
        assert "reply" not in columns
        assert "wa_message_id" not in columns
    assert "question_en" in latest_call[1]
    assert all(call[2].get("count") == "exact" and call[2].get("head") is True for call in client.calls[:11])


def test_one_failed_count_does_not_blank_the_dashboard():
    client = _Scripted(
        [
            RuntimeError("db down"),
            ([], 4),
            ([], 4),
            ([], 1),
            ([], 1),
            ([], 1),
            ([], 0),
            ([], 1),
            ([], 0),
            ([], 1),
            ([], 0),
            ([{"minutes_saved_per_question": 5}], None),
            ([], None),
            ([], None),
        ]
    )
    payload = load_dashboard(client, NOW)
    assert payload["metrics"]["needs_attention"] is None
    assert payload["metrics"]["needs_attention_detail"] == "Unavailable"
    assert payload["metrics"]["questions_today"] == 4
    assert payload["metrics"]["answered_by_tina"] == "100%"
    assert payload["header_date"] == "Thu 8 Oct"


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
