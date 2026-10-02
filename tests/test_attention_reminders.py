"""Unit tests for Slack Needs-attention 24h reply-window reminders."""

from __future__ import annotations

import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

_ROOT = Path(__file__).resolve().parents[1]


def _load(name: str, relative: str) -> ModuleType:
    path = _ROOT / relative
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# Lightweight stubs so attention_reminders can import package-style names.
_slack = _load("tis_agent_slack_notify_rem", "tis_agent/slack_notify.py")
sys.modules["tis_agent.slack_notify"] = _slack

# Minimal human_reply stub (avoid openai via tis_agent package init).
_hr = ModuleType("tis_agent.human_reply")


def _parse_iso(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        stamp = value
    else:
        try:
            stamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)


class _ReplyWindow:
    def __init__(
        self,
        *,
        is_open: bool,
        last_inbound_at: datetime | None,
        expires_at: datetime | None,
        remaining_seconds: int,
        label: str,
    ):
        self.is_open = is_open
        self.last_inbound_at = last_inbound_at
        self.expires_at = expires_at
        self.remaining_seconds = remaining_seconds
        self.label = label


def _format_remaining(seconds: int) -> str:
    if seconds <= 0:
        return "24h reply window closed"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours >= 1:
        return f"24h window — {hours}h left"
    if minutes >= 1:
        return f"24h window — {minutes}m left"
    return "24h window — under a minute left"


def _reply_window(last_inbound_at: Any, *, now: datetime | None = None) -> _ReplyWindow:
    stamp = _parse_iso(last_inbound_at)
    if stamp is None:
        return _ReplyWindow(
            is_open=False,
            last_inbound_at=None,
            expires_at=None,
            remaining_seconds=0,
            label="No inbound message — reply window unknown",
        )
    moment = now or datetime.now(timezone.utc)
    expires_at = stamp + timedelta(hours=24)
    remaining = max(int((expires_at - moment).total_seconds()), 0)
    return _ReplyWindow(
        is_open=remaining > 0,
        last_inbound_at=stamp,
        expires_at=expires_at,
        remaining_seconds=remaining,
        label=_format_remaining(remaining),
    )


_hr.REPLY_WINDOW_HOURS = 24
_hr.format_remaining = _format_remaining
_hr.reply_window = _reply_window
_hr.parse_iso = _parse_iso
sys.modules["tis_agent.human_reply"] = _hr

# Stub config/clients used only if real path runs.
_cfg = ModuleType("tis_agent.config")
_cfg.get_settings = lambda: None  # type: ignore[attr-defined]
_cfg.Settings = object
sys.modules["tis_agent.config"] = _cfg
_clients = ModuleType("tis_agent.clients")
_clients.make_supabase = lambda *_a, **_k: None  # type: ignore[attr-defined]
sys.modules["tis_agent.clients"] = _clients

# Package shell without importing ask/openai.
if "tis_agent" not in sys.modules:
    pkg = ModuleType("tis_agent")
    pkg.__path__ = [str(_ROOT / "tis_agent")]  # type: ignore[attr-defined]
    sys.modules["tis_agent"] = pkg

_rem = _load("tis_agent_attention_reminders", "tis_agent/attention_reminders.py")
sys.modules["tis_agent.attention_reminders"] = _rem

next_reminder_milestone = _slack.next_reminder_milestone
mark_reminder_milestones = _slack.mark_reminder_milestones
run_attention_reminders = _rem.run_attention_reminders
notify_interaction_needs_attention = _rem.notify_interaction_needs_attention


def test_next_milestone_bands() -> None:
    assert next_reminder_milestone(5 * 3600, set()) is None
    assert next_reminder_milestone(3 * 3600, set()) == "4h"
    assert next_reminder_milestone(50 * 60, set()) == "1h"
    assert next_reminder_milestone(50 * 60, {"4h"}) == "1h"
    assert next_reminder_milestone(50 * 60, {"4h", "1h"}) is None
    assert next_reminder_milestone(0, set()) is None


def test_mark_milestones_includes_looser_when_skipping() -> None:
    assert mark_reminder_milestones("4h") == ["4h"]
    assert mark_reminder_milestones("1h") == ["4h", "1h"]


def test_run_reminders_posts_once_per_milestone(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc)
    inbound = now - timedelta(hours=21)  # 3h left → 4h milestone
    rows = [
        {
            "id": "int-1",
            "session_id": "sess-1",
            "wa_from": "819011112222",
            "question": "Bus?",
            "reply": "Not sure.",
            "outcome": "no_evidence",
            "language": "en",
            "wa_message_id": "wamid.1",
            "reviewed_at": None,
            "human_replied_at": None,
            "manual_attention_at": None,
        }
    ]
    upserts: list[dict[str, Any]] = []
    posted: list[dict[str, Any]] = []

    class FakeTable:
        def __init__(self, name: str):
            self.name = name

        def select(self, *_args: Any, **_kwargs: Any) -> "FakeTable":
            return self

        def eq(self, *_args: Any, **_kwargs: Any) -> "FakeTable":
            return self

        def in_(self, *_args: Any, **_kwargs: Any) -> "FakeTable":
            return self

        def is_(self, *_args: Any, **_kwargs: Any) -> "FakeTable":
            return self

        def order(self, *_args: Any, **_kwargs: Any) -> "FakeTable":
            return self

        def limit(self, *_args: Any, **_kwargs: Any) -> "FakeTable":
            return self

        def upsert(self, row: dict[str, Any], **_kwargs: Any) -> "FakeTable":
            upserts.append(row)
            return self

        def execute(self) -> Any:
            if self.name == "unanswered_interactions":
                return type("R", (), {"data": rows})()
            if self.name == "slack_attention_reminders":
                return type("R", (), {"data": []})()
            if self.name == "interactions":
                return type(
                    "R",
                    (),
                    {"data": [{"created_at": inbound.isoformat()}]},
                )()
            return type("R", (), {"data": []})()

    class FakeClient:
        def table(self, name: str) -> FakeTable:
            return FakeTable(name)

    monkeypatch.setattr(_rem, "notify_window_reminder", lambda **k: posted.append(k))
    monkeypatch.setattr(_rem, "_sent_milestones", lambda *_a, **_k: {})

    summary = run_attention_reminders(client=FakeClient(), now=now)
    assert summary["reminded"] == 1
    assert posted[0]["milestone"] == "4h"
    assert posted[0]["question"] == "Bus?"
    assert upserts and upserts[0]["milestone"] == "4h"


def test_run_reminders_skips_closed_window(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc)
    inbound = now - timedelta(hours=30)
    rows = [
        {
            "id": "int-2",
            "session_id": "sess-2",
            "wa_from": "819033334444",
            "question": "Late?",
            "reply": "No evidence.",
            "outcome": "no_evidence",
            "language": "en",
            "reviewed_at": None,
            "human_replied_at": None,
            "manual_attention_at": None,
        }
    ]
    posted: list[Any] = []

    class FakeTable:
        def __init__(self, name: str):
            self.name = name

        def select(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def eq(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def in_(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def order(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def limit(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def execute(self) -> Any:
            if self.name == "unanswered_interactions":
                return type("R", (), {"data": rows})()
            if self.name == "interactions":
                return type(
                    "R",
                    (),
                    {"data": [{"created_at": inbound.isoformat()}]},
                )()
            return type("R", (), {"data": []})()

    class FakeClient:
        def table(self, name: str) -> FakeTable:
            return FakeTable(name)

    monkeypatch.setattr(_rem, "notify_window_reminder", lambda **k: posted.append(k))
    summary = run_attention_reminders(client=FakeClient(), now=now)
    assert summary["reminded"] == 0
    assert posted == []


def test_notify_interaction_force_posts(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[dict[str, Any]] = []

    class FakeTable:
        def __init__(self, name: str):
            self.name = name

        def select(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def eq(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def order(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def limit(self, *_a: Any, **_k: Any) -> "FakeTable":
            return self

        def execute(self) -> Any:
            if self.name == "interactions":
                return type(
                    "R",
                    (),
                    {
                        "data": [
                            {
                                "id": "m1",
                                "session_id": "s1",
                                "wa_from": "819055556666",
                                "question": "Flag me",
                                "reply": "ok",
                                "outcome": "success",
                                "language": "en",
                                "wa_message_id": None,
                                "reviewed_at": None,
                                "human_replied_at": None,
                                "manual_attention_at": "2026-10-02T00:00:00+00:00",
                                "created_at": "2026-10-02T00:00:00+00:00",
                            }
                        ]
                    },
                )()
            return type("R", (), {"data": []})()

    class FakeClient:
        def table(self, name: str) -> FakeTable:
            return FakeTable(name)

    monkeypatch.setattr(_rem, "notify_needs_attention", lambda **k: captured.append(k))
    result = notify_interaction_needs_attention("m1", client=FakeClient())
    assert result["posted"] is True
    assert captured[0]["force"] is True
    assert captured[0]["question"] == "Flag me"
