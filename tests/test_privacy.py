"""Retention choices and the first-contact privacy line."""

import pytest

from tis_agent.privacy import (
    ALLOWED_RETENTION_DAYS,
    _cutoff,
    first_contact_line,
    normalize_phone,
    phone_variants,
)


def test_phone_variants_cover_digits_and_plus():
    assert normalize_phone("+81 90-1234-5678") == "819012345678"
    variants = phone_variants("81 90 1234 5678")
    assert "819012345678" in variants
    assert "+819012345678" in variants


def test_first_contact_line_includes_version_and_url():
    line = first_contact_line("https://admin.example/privacy")
    assert "not a service of Tokyo International School" in line
    assert "2026-10-09" in line
    assert line.endswith("https://admin.example/privacy")


def test_first_contact_line_is_empty_without_a_url():
    assert first_contact_line("  ") == ""


def test_retention_cutoff_rejects_other_periods():
    for days in ALLOWED_RETENTION_DAYS:
        assert _cutoff(days)
    with pytest.raises(ValueError):
        _cutoff(45)
