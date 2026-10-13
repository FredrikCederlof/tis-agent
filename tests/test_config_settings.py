"""Settings loading for cron jobs that do not need OpenAI."""

from __future__ import annotations

import pytest

from tis_agent import config


def test_get_settings_requires_openai_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "secret")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(SystemExit, match="OPENAI_API_KEY"):
        config.get_settings()


def test_get_settings_can_skip_openai_for_privacy_cron(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "secret")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    settings = config.get_settings(require_openai=False)
    assert settings.supabase_url.startswith("https://")
    assert settings.openai_api_key == ""
