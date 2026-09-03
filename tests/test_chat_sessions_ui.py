"""Admin Chats session helpers (INS-11)."""

from datetime import datetime, timezone

from tis_agent.chat_sessions_ui import (
    build_timeline,
    is_unread,
    needs_attention,
    parent_hue,
    parent_label,
    reply_target,
    same_parent_other_sessions_remain,
)

GAP = {
    "id": "i1",
    "question": "Can students wear sports shoes tomorrow?",
    "reply": "I couldn't find an official source for that.",
    "outcome": "no_evidence",
    "reviewed_at": None,
    "created_at": "2026-09-03T01:00:00+00:00",
}
ANSWERED = {
    "id": "i2",
    "question": "Is there a dress code?",
    "reply": "Yes, there is a dress code at TIS.",
    "outcome": "success",
    "reviewed_at": None,
    "created_at": "2026-09-03T02:00:00+00:00",
}


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


def test_needs_attention_only_for_unreviewed_gaps() -> None:
    assert needs_attention(GAP) is True
    assert needs_attention(ANSWERED) is False
    assert needs_attention({**GAP, "reviewed_at": "2026-09-03T03:00:00+00:00"}) is False


def test_timeline_orders_question_then_tina_then_admin_reply() -> None:
    admin_reply = {
        "id": "r1",
        "interaction_id": "i1",
        "body": "Yes — sports shoes are fine tomorrow.",
        "status": "sent",
        "sent_by": "admin@tokyois.com",
        "created_at": "2026-09-03T01:30:00+00:00",
    }
    timeline = build_timeline([GAP, ANSWERED], [admin_reply])
    assert [message["kind"] for message in timeline] == [
        "parent",
        "tina",
        "admin",
        "parent",
        "tina",
    ]
    assert timeline[0]["needs_attention"] is True
    assert timeline[0]["suggested_answer"] == GAP["reply"]
    assert timeline[2]["text"] == "Yes — sports shoes are fine tomorrow."
    assert timeline[2]["sent_by"] == "admin@tokyois.com"


def test_timeline_skips_missing_tina_reply() -> None:
    timeline = build_timeline([{**GAP, "reply": None}])
    assert [message["kind"] for message in timeline] == ["parent"]


def test_reply_target_prefers_oldest_unanswered_question() -> None:
    assert reply_target([ANSWERED, GAP])["id"] == "i1"


def test_reply_target_falls_back_to_newest_question() -> None:
    assert reply_target([ANSWERED, {**GAP, "outcome": "success"}])["id"] == "i2"
    assert reply_target([]) is None


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
