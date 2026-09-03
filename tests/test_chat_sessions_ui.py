"""Admin Chats session helpers (INS-11)."""

from datetime import datetime, timezone

from tis_agent.chat_sessions_ui import (
    is_unread,
    parent_hue,
    parent_label,
    same_parent_other_sessions_remain,
)


def test_unread_when_never_opened() -> None:
    now = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
    assert is_unread(None, now) is True


def test_unread_when_newer_message_after_read() -> None:
    read_at = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
    later = datetime(2026, 9, 3, 10, 5, tzinfo=timezone.utc)
    earlier = datetime(2026, 9, 3, 9, 55, tzinfo=timezone.utc)
    assert is_unread(read_at, later) is True
    assert is_unread(read_at, earlier) is False
    assert is_unread(read_at, read_at) is False


def test_parent_label_uses_last_four_digits() -> None:
    assert parent_label("46701234567") == "Parent ·••4567"
    assert parent_label("+46 70 123 4567") == "Parent ·••4567"
    assert parent_label("") == "Parent"


def test_parent_avatar_hue_is_stable() -> None:
    assert parent_hue("46701234567") == parent_hue("46701234567")
    assert parent_hue("46701234567") != parent_hue("46709999999")


def test_delete_one_session_leaves_other_sessions_for_parent() -> None:
    rows = [
        {"id": "s1", "wa_from": "46701111111"},
        {"id": "s2", "wa_from": "46701111111"},
        {"id": "s3", "wa_from": "46702222222"},
    ]
    assert same_parent_other_sessions_remain(rows, deleted_id="s1", wa_from="46701111111") is True
    leftover = [row for row in rows if row["id"] != "s1"]
    assert {row["id"] for row in leftover} == {"s2", "s3"}
    assert same_parent_other_sessions_remain([rows[0]], deleted_id="s1", wa_from="46701111111") is False
