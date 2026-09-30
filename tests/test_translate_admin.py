"""Tests for admin English translation helpers (INS-21)."""

from tis_agent.translate_admin import (
    is_english_language,
    looks_like_english,
    should_translate,
)


def test_skips_english_language_and_english_looking_text() -> None:
    assert is_english_language("en")
    assert is_english_language("en-US")
    assert not is_english_language("sv")
    assert looks_like_english("Where can I buy school sweaters?")
    assert not looks_like_english("Var köper man skoltröjor?")
    assert should_translate("Var köper man skoltröjor?", "sv")
    assert not should_translate("Where can I buy school sweaters?", "sv")
    assert not should_translate("Var köper man skoltröjor?", "en")
    assert not should_translate("", "sv")
