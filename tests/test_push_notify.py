"""Unit tests for Needs attention Web Push notify hook."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import pytest

_PUSH_PATH = Path(__file__).resolve().parents[1] / "tis_agent" / "push_notify.py"
_SPEC = importlib.util.spec_from_file_location("tis_agent_push_notify", _PUSH_PATH)
assert _SPEC and _SPEC.loader
_MOD = importlib.util.module_from_spec(_SPEC)
sys.modules["tis_agent_push_notify"] = _MOD
_SPEC.loader.exec_module(_MOD)

notify_needs_attention = _MOD.notify_needs_attention
should_notify_outcome = _MOD.should_notify_outcome


def test_should_notify_only_gap_outcomes() -> None:
    assert should_notify_outcome("no_evidence") is True
    assert should_notify_outcome("low_confidence") is True
    assert should_notify_outcome("success") is False
    assert should_notify_outcome("error") is False
    assert should_notify_outcome(None) is False


def test_notify_skips_non_gap_without_network(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[Any] = []

    def boom(*_args: Any, **_kwargs: Any) -> Any:
        called.append(True)
        raise AssertionError("should not network")

    monkeypatch.setattr("urllib.request.urlopen", boom)
    monkeypatch.setenv("TINA_ADMIN_URL", "https://admin.example")
    monkeypatch.setenv("ADMIN_SYNC_SECRET", "secret")
    notify_needs_attention("id-1", outcome="success")
    assert called == []


def test_notify_posts_when_gap(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    class FakeResponse:
        status = 200

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

    def fake_urlopen(request: Any, timeout: float = 0) -> FakeResponse:
        captured["url"] = request.full_url
        captured["method"] = request.get_method()
        captured["headers"] = dict(request.headers)
        captured["body"] = request.data
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setenv("TINA_ADMIN_URL", "https://admin.example/")
    monkeypatch.setenv("ADMIN_SYNC_SECRET", "top-secret")

    class ImmediateThread:
        def __init__(self, target=None, name=None, daemon=None):  # type: ignore[no-untyped-def]
            self._target = target

        def start(self) -> None:
            assert self._target is not None
            self._target()

    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    notify_needs_attention("abc-123", outcome="no_evidence")

    assert captured["url"] == "https://admin.example/api/push/notify"
    assert captured["method"] == "POST"
    assert captured["headers"]["Authorization"] == "Bearer top-secret"
    assert json.loads(captured["body"].decode()) == {"interaction_id": "abc-123"}


def test_notify_missing_secret_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[Any] = []

    def boom(*_args: Any, **_kwargs: Any) -> Any:
        called.append(True)
        raise AssertionError("should not network")

    monkeypatch.setattr("urllib.request.urlopen", boom)
    monkeypatch.delenv("TINA_ADMIN_URL", raising=False)
    monkeypatch.delenv("ADMIN_SYNC_SECRET", raising=False)
    notify_needs_attention("abc", outcome="no_evidence")
    assert called == []


def test_notify_uses_default_admin_url(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    class FakeResponse:
        status = 200

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

    def fake_urlopen(request: Any, timeout: float = 0) -> FakeResponse:
        captured["url"] = request.full_url
        return FakeResponse()

    class ImmediateThread:
        def __init__(self, target=None, name=None, daemon=None):  # type: ignore[no-untyped-def]
            self._target = target

        def start(self) -> None:
            assert self._target is not None
            self._target()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(_MOD.threading, "Thread", ImmediateThread)
    monkeypatch.delenv("TINA_ADMIN_URL", raising=False)
    monkeypatch.setenv("ADMIN_SYNC_SECRET", "secret")
    notify_needs_attention("xyz", outcome="low_confidence")
    assert captured["url"] == "https://admin-lac-zeta.vercel.app/api/push/notify"
