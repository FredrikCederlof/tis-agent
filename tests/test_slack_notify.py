"""Unit tests for Slack Incoming Webhook notify (parent Q&A + needs attention)."""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest

_PATH = Path(__file__).resolve().parents[1] / "tis_agent" / "slack_notify.py"
_SPEC = importlib.util.spec_from_file_location("tis_agent_slack_notify", _PATH)
assert _SPEC and _SPEC.loader
_MOD = importlib.util.module_from_spec(_SPEC)
sys.modules["tis_agent_slack_notify"] = _MOD
_SPEC.loader.exec_module(_MOD)

format_slack_payload = _MOD.format_slack_payload
humanize_outcome = _MOD.humanize_outcome
admin_deep_link = _MOD.admin_deep_link
mask_wa_from = _MOD.mask_wa_from
mark_reminder_milestones = _MOD.mark_reminder_milestones
next_reminder_milestone = _MOD.next_reminder_milestone
notify_needs_attention = _MOD.notify_needs_attention
notify_parent_question = _MOD.notify_parent_question
notify_slack_interaction = _MOD.notify_slack_interaction
notify_window_reminder = _MOD.notify_window_reminder
should_notify_needs_attention = _MOD.should_notify_needs_attention


class ImmediateThread:
    def __init__(self, target=None, name=None, daemon=None):  # type: ignore[no-untyped-def]
        self._target = target

    def start(self) -> None:
        assert self._target is not None
        self._target()


class FakeResponse:
    status = 200

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def test_mask_wa_from() -> None:
    assert mask_wa_from("whatsapp:+819012345678") == "Parent ·••5678"
    assert mask_wa_from("819012345678") == "Parent ·••5678"
    assert mask_wa_from("12") == "Parent ·••12"
    assert mask_wa_from("") == "Parent"
    assert mask_wa_from(None) == "Parent"


def test_should_notify_needs_attention_only_gaps() -> None:
    assert should_notify_needs_attention("no_evidence") is True
    assert should_notify_needs_attention("low_confidence") is True
    assert should_notify_needs_attention("success") is False
    assert should_notify_needs_attention("error") is False
    assert should_notify_needs_attention(None) is False


def test_humanize_outcome() -> None:
    assert humanize_outcome("success") == "High confidence"
    assert "Low confidence" in humanize_outcome("low_confidence")
    assert "No matching school info" in humanize_outcome("no_evidence")
    assert humanize_outcome("error") == "Tina error"
    assert humanize_outcome("manual") == "Manually flagged"


def test_admin_deep_link(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TINA_ADMIN_URL", "https://admin.example/")
    assert admin_deep_link(session_id="sess-1") == "https://admin.example/chats/sess-1"
    assert (
        admin_deep_link(session_id=None, needs_attention=True)
        == "https://admin.example/inbox"
    )


def test_format_includes_question_reply_mask_outcome() -> None:
    when = datetime(2026, 10, 2, 12, 0, tzinfo=ZoneInfo("Asia/Tokyo"))
    payload = format_slack_payload(
        title="Tina parent question",
        question="When is sports day?",
        reply="Sports Day is on 15 October.",
        wa_from="whatsapp:+819012345678",
        outcome="success",
        session_id="sess-1",
        language="en",
        wa_message_id="wamid.abc",
        when=when,
    )
    text = payload["text"]
    assert "When is sports day?" in text
    assert "Sports Day is on 15 October." in text
    assert "Parent ·••5678" in text
    assert "High confidence" in text
    assert "2026/10/02 12:00 JST" in text
    assert "sess-1" not in text or "/chats/sess-1" in text  # id only in deep link
    assert "wamid.abc" not in text
    assert "Session:" not in text
    assert "WA message:" not in text
    blocks_blob = json.dumps(payload["blocks"], ensure_ascii=False)
    assert "When is sports day?" in blocks_blob
    assert "Sports Day is on 15 October." in blocks_blob
    assert "Parent ·••5678" in blocks_blob
    assert "High confidence" in blocks_blob
    assert "2026/10/02 12:00 JST" in blocks_blob
    assert "*Session:*" not in blocks_blob
    assert "*WA message:*" not in blocks_blob
    assert "/chats/sess-1" in blocks_blob
    assert payload["blocks"][-1]["type"] == "actions"
    assert payload["blocks"][-1]["elements"][0]["url"].endswith("/chats/sess-1")
    assert payload["blocks"][-1]["elements"][0]["text"]["text"] == "Open Message"
    # No duplicate markdown link in the meta section.
    meta_blob = payload["blocks"][-2]["text"]["text"]
    assert "Open Message" not in meta_blob
    assert "<http" not in meta_blob


def test_format_needs_attention_deep_link_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TINA_ADMIN_URL", "https://admin.example")
    payload = format_slack_payload(
        title="Needs attention",
        question="Q?",
        reply="A",
        wa_from="1234",
        outcome="no_evidence",
        session_id=None,
        needs_attention=True,
    )
    assert payload["blocks"][-1]["elements"][0]["url"] == "https://admin.example/inbox"
    assert "No matching school info" in payload["text"]


def test_format_truncates_long_reply() -> None:
    long_reply = "x" * 4000
    payload = format_slack_payload(
        title="Tina parent question",
        question="Q?",
        reply=long_reply,
        wa_from="1234",
        outcome="success",
    )
    reply_section = payload["blocks"][2]["text"]["text"]
    assert len(reply_section) < 2600
    assert reply_section.endswith("…")


def test_parent_webhook_always_called_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, Any]] = []

    def fake_urlopen(request: Any, timeout: float = 0) -> FakeResponse:
        captured.append(
            {
                "url": request.full_url,
                "body": json.loads(request.data.decode()),
                "timeout": timeout,
            }
        )
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    monkeypatch.setenv(
        "SLACK_WEBHOOK_PARENT_QUESTIONS", "https://hooks.slack.com/services/PARENT"
    )
    monkeypatch.delenv("SLACK_WEBHOOK_NEEDS_ATTENTION", raising=False)

    notify_parent_question(
        question="Hello?",
        reply="Hi",
        wa_from="819011112222",
        outcome="success",
        session_id="s1",
        language="en",
    )
    assert len(captured) == 1
    assert captured[0]["url"] == "https://hooks.slack.com/services/PARENT"
    assert "Hello?" in captured[0]["body"]["text"]


def test_needs_attention_only_for_gap_outcomes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[str] = []

    def fake_urlopen(request: Any, timeout: float = 0) -> FakeResponse:
        captured.append(request.full_url)
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    monkeypatch.setenv(
        "SLACK_WEBHOOK_NEEDS_ATTENTION", "https://hooks.slack.com/services/NEEDS"
    )

    notify_needs_attention(
        question="Q",
        reply="A",
        wa_from="1234",
        outcome="success",
    )
    assert captured == []

    notify_needs_attention(
        question="Q",
        reply="A",
        wa_from="1234",
        outcome="no_evidence",
    )
    assert captured == ["https://hooks.slack.com/services/NEEDS"]

    captured.clear()
    notify_needs_attention(
        question="Q",
        reply="A",
        wa_from="1234",
        outcome="low_confidence",
    )
    assert captured == ["https://hooks.slack.com/services/NEEDS"]


def test_notify_slack_interaction_routes_both(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[str] = []

    def fake_urlopen(request: Any, timeout: float = 0) -> FakeResponse:
        captured.append(request.full_url)
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    monkeypatch.setenv(
        "SLACK_WEBHOOK_PARENT_QUESTIONS", "https://hooks.slack.com/services/PARENT"
    )
    monkeypatch.setenv(
        "SLACK_WEBHOOK_NEEDS_ATTENTION", "https://hooks.slack.com/services/NEEDS"
    )

    notify_slack_interaction(
        wa_from="819012345678",
        question="Missing?",
        reply="I don't know.",
        outcome="no_evidence",
        language="en",
        session_id="sess",
    )
    assert captured == [
        "https://hooks.slack.com/services/PARENT",
        "https://hooks.slack.com/services/NEEDS",
    ]

    captured.clear()
    notify_slack_interaction(
        wa_from="819012345678",
        question="OK?",
        reply="Yes.",
        outcome="success",
        language="en",
        session_id="sess",
    )
    assert captured == ["https://hooks.slack.com/services/PARENT"]


def test_missing_env_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[Any] = []

    def boom(*_args: Any, **_kwargs: Any) -> Any:
        called.append(True)
        raise AssertionError("should not network")

    monkeypatch.setattr("urllib.request.urlopen", boom)
    monkeypatch.delenv("SLACK_WEBHOOK_PARENT_QUESTIONS", raising=False)
    monkeypatch.delenv("SLACK_WEBHOOK_NEEDS_ATTENTION", raising=False)
    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("SLACK_NEEDS_ATTENTION_WEBHOOK_URL", raising=False)
    _MOD._missing_logged.clear()

    notify_slack_interaction(
        wa_from="1234",
        question="Q",
        reply="A",
        outcome="no_evidence",
    )
    assert called == []


def test_http_errors_swallowed(monkeypatch: pytest.MonkeyPatch) -> None:
    import urllib.error

    def boom(*_args: Any, **_kwargs: Any) -> Any:
        raise urllib.error.HTTPError(
            "https://hooks.slack.com/services/PARENT",
            500,
            "fail",
            hdrs=None,  # type: ignore[arg-type]
            fp=None,
        )

    monkeypatch.setattr("urllib.request.urlopen", boom)
    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    monkeypatch.setenv(
        "SLACK_WEBHOOK_PARENT_QUESTIONS", "https://hooks.slack.com/services/PARENT"
    )
    monkeypatch.setenv(
        "SLACK_WEBHOOK_NEEDS_ATTENTION", "https://hooks.slack.com/services/NEEDS"
    )

    # Must not raise
    notify_slack_interaction(
        wa_from="1234",
        question="Q",
        reply="A",
        outcome="low_confidence",
    )


def test_reminder_milestone_helpers() -> None:
    assert next_reminder_milestone(3 * 3600, set()) == "4h"
    assert next_reminder_milestone(30 * 60, set()) == "1h"
    assert mark_reminder_milestones("1h") == ["4h", "1h"]


def test_window_reminder_posts_to_needs_channel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[str] = []

    def fake_urlopen(request: Any, timeout: float = 0) -> FakeResponse:
        captured.append(request.full_url)
        body = json.loads(request.data.decode())
        assert "Reply window closing" in body["text"] or any(
            "Reply window closing" in json.dumps(b)
            for b in body.get("blocks", [])
        )
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    monkeypatch.setenv(
        "SLACK_WEBHOOK_NEEDS_ATTENTION", "https://hooks.slack.com/services/NEEDS"
    )

    notify_window_reminder(
        question="Still open?",
        reply="Gap",
        wa_from="819012345678",
        outcome="no_evidence",
        milestone="4h",
        remaining_seconds=3 * 3600,
    )
    assert captured == ["https://hooks.slack.com/services/NEEDS"]


def test_force_needs_attention_for_manual(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[str] = []

    def fake_urlopen(request: Any, timeout: float = 0) -> FakeResponse:
        captured.append(request.full_url)
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    monkeypatch.setenv(
        "SLACK_WEBHOOK_NEEDS_ATTENTION", "https://hooks.slack.com/services/NEEDS"
    )
    # success is not a gap — force required for manual flags
    notify_needs_attention(
        question="Flag",
        reply="ok",
        wa_from="1234",
        outcome="success",
    )
    assert captured == []
    notify_needs_attention(
        question="Flag",
        reply="ok",
        wa_from="1234",
        outcome="success",
        force=True,
    )
    assert captured == ["https://hooks.slack.com/services/NEEDS"]


def test_railway_env_aliases_when_canonical_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[str] = []

    def fake_urlopen(request: Any, timeout: float = 0) -> FakeResponse:
        captured.append(request.full_url)
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    monkeypatch.delenv("SLACK_WEBHOOK_PARENT_QUESTIONS", raising=False)
    monkeypatch.delenv("SLACK_WEBHOOK_NEEDS_ATTENTION", raising=False)
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/PARENT")
    monkeypatch.setenv(
        "SLACK_NEEDS_ATTENTION_WEBHOOK_URL", "https://hooks.slack.com/services/NEEDS"
    )

    notify_slack_interaction(
        wa_from="819012345678",
        question="Missing?",
        reply="I don't know.",
        outcome="no_evidence",
        language="en",
        session_id="sess",
    )
    assert captured == [
        "https://hooks.slack.com/services/PARENT",
        "https://hooks.slack.com/services/NEEDS",
    ]

    captured.clear()
    monkeypatch.setenv(
        "SLACK_WEBHOOK_PARENT_QUESTIONS", "https://hooks.slack.com/services/CANON"
    )
    notify_parent_question(
        question="Hello?",
        reply="Hi",
        wa_from="819011112222",
        outcome="success",
    )
    assert captured == ["https://hooks.slack.com/services/CANON"]
