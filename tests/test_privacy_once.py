"""Privacy notice should appear once per WhatsApp number."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

from tis_agent.privacy import has_prior_session


class _FakeResult:
    def __init__(self, data: list[dict[str, Any]] | None):
        self.data = data


class _FakeTable:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def select(self, *_a: Any, **_k: Any) -> "_FakeTable":
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_FakeTable":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_FakeTable":
        return self

    def execute(self) -> _FakeResult:
        return _FakeResult(self._rows)


class _FakeClient:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def table(self, _name: str) -> _FakeTable:
        return _FakeTable(self._rows)


def test_has_prior_session_true_when_any_session_exists(monkeypatch) -> None:
    import tis_agent.privacy as privacy

    monkeypatch.setattr(
        privacy,
        "make_supabase",
        lambda _settings: _FakeClient([{"id": "sess-1"}]),
    )
    assert has_prior_session(object(), "819012345678") is True  # type: ignore[arg-type]


def test_has_prior_session_false_for_new_number(monkeypatch) -> None:
    import tis_agent.privacy as privacy

    monkeypatch.setattr(
        privacy,
        "make_supabase",
        lambda _settings: _FakeClient([]),
    )
    assert has_prior_session(object(), "819099999999") is False  # type: ignore[arg-type]


def test_has_prior_session_true_on_lookup_failure(monkeypatch) -> None:
    import tis_agent.privacy as privacy

    def _boom(_settings: Any) -> Any:
        raise RuntimeError("db down")

    monkeypatch.setattr(privacy, "make_supabase", _boom)
    assert has_prior_session(object(), "819012345678") is True  # type: ignore[arg-type]


def test_whatsapp_show_notice_uses_has_prior_session_not_active_session(
    monkeypatch,
) -> None:
    """Expired 10-minute session must not re-show the privacy notice."""
    import tis_agent.whatsapp as wa
    from tis_agent.ask import AnswerResult
    from tis_agent.analytics import OUTCOME_SUCCESS

    wa_settings = MagicMock()
    app_settings = MagicMock()
    monkeypatch.setenv("PRIVACY_NOTICE_URL", "https://example.com/privacy")

    with (
        patch.object(wa, "claim_whatsapp_message", return_value=True),
        patch.object(wa, "send_typing_indicator"),
        patch.object(wa, "get_settings", return_value=app_settings),
        patch.object(wa, "has_prior_session", return_value=True) as prior,
        patch.object(wa, "peek_session_id", return_value=None),
        patch.object(wa, "load_session_history") as load_hist,
        patch.object(
            wa,
            "answer_question",
            return_value=AnswerResult(
                reply="School as usual.",
                language="en",
                outcome=OUTCOME_SUCCESS,
                evidence_count=1,
                top_similarity=0.9,
            ),
        ),
        patch.object(wa, "send_text") as send,
        patch.object(wa, "resolve_session_id", return_value="sess-new"),
        patch.object(wa, "log_interaction"),
    ):
        wa._reply_to_inbound(
            wa_settings,
            "819012345678",
            "Is it school tomorrow?",
            wa_message_id="wamid.1",
        )

    prior.assert_called_once_with(app_settings, "819012345678")
    load_hist.assert_not_called()
    sent = send.call_args.args[2]
    assert "Privacy notice" not in sent
    assert "School as usual." in sent


def test_whatsapp_shows_notice_for_brand_new_number(monkeypatch) -> None:
    import tis_agent.whatsapp as wa
    from tis_agent.ask import AnswerResult
    from tis_agent.analytics import OUTCOME_SUCCESS

    wa_settings = MagicMock()
    app_settings = MagicMock()
    monkeypatch.setenv("PRIVACY_NOTICE_URL", "https://example.com/privacy")

    with (
        patch.object(wa, "claim_whatsapp_message", return_value=True),
        patch.object(wa, "send_typing_indicator"),
        patch.object(wa, "get_settings", return_value=app_settings),
        patch.object(wa, "has_prior_session", return_value=False),
        patch.object(wa, "peek_session_id", return_value=None),
        patch.object(
            wa,
            "answer_question",
            return_value=AnswerResult(
                reply="Hello.",
                language="en",
                outcome=OUTCOME_SUCCESS,
                evidence_count=0,
                top_similarity=None,
            ),
        ),
        patch.object(wa, "send_text") as send,
        patch.object(wa, "resolve_session_id", return_value="sess-1"),
        patch.object(wa, "log_interaction"),
    ):
        wa._reply_to_inbound(
            wa_settings,
            "819099999999",
            "Hi",
            wa_message_id="wamid.2",
        )

    sent = send.call_args.args[2]
    assert "Privacy notice" in sent
    assert "https://example.com/privacy" in sent
