"""Human in the loop: admin replies, the 24h window, and failed sends."""

from datetime import datetime, timedelta, timezone

import pytest

from tis_agent.human_reply import (
    ReplySendFailed,
    ReplyWindowClosed,
    normalize_reply_payload,
    reply_window,
    send_human_reply,
)

NOW = datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc)
INTERACTION_ID = "11111111-1111-4111-8111-111111111111"
SESSION_ID = "22222222-2222-4222-8222-222222222222"
WA_FROM = "818021428469"


class FakeQuery:
    def __init__(self, table: "FakeTable"):
        self.table_ref = table
        self.filters: dict[str, object] = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        rows = [
            row
            for row in self.table_ref.rows
            if all(row.get(k) == v for k, v in self.filters.items())
        ]
        rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
        return type("Result", (), {"data": rows})()


class FakeUpdate(FakeQuery):
    def __init__(self, table: "FakeTable", values: dict):
        super().__init__(table)
        self.values = values

    def execute(self):
        for row in self.table_ref.rows:
            if all(row.get(k) == v for k, v in self.filters.items()):
                row.update(self.values)
                self.table_ref.updates.append(dict(self.values))
        return type("Result", (), {"data": []})()


class FakeTable:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.inserted: list[dict] = []
        self.updates: list[dict] = []

    def select(self, *args, **kwargs):
        return FakeQuery(self).select(*args, **kwargs)

    def update(self, values):
        return FakeUpdate(self, values)

    def insert(self, row):
        stored = {"id": f"reply-{len(self.inserted) + 1}", **row}
        self.inserted.append(stored)
        self.rows.append(stored)
        return type("Insert", (), {"execute": lambda _self=None: type("R", (), {"data": [stored]})()})()


class FakeClient:
    def __init__(self, *, last_inbound: datetime, reviewed_at: str | None = None):
        self.tables = {
            "interactions": FakeTable(
                [
                    {
                        "id": INTERACTION_ID,
                        "session_id": SESSION_ID,
                        "wa_from": WA_FROM,
                        "wa_message_id": "wamid.TEST",
                        "question": "Can students wear sports shoes tomorrow?",
                        "outcome": "no_evidence",
                        "reviewed_at": reviewed_at,
                        "created_at": last_inbound.isoformat(),
                    }
                ]
            ),
            "admin_replies": FakeTable([]),
        }

    def table(self, name):
        return self.tables[name]


def test_window_open_shows_hours_remaining():
    window = reply_window(NOW - timedelta(hours=6), now=NOW)
    assert window.is_open is True
    assert window.label == "Reply window open — 18h remaining"
    assert window.expires_at == NOW + timedelta(hours=18)


def test_window_expired_after_24h():
    window = reply_window(NOW - timedelta(hours=24, minutes=1), now=NOW)
    assert window.is_open is False
    assert window.remaining_seconds == 0
    assert window.label == "Reply window expired"


def test_window_shows_minutes_when_nearly_closed():
    assert reply_window(NOW - timedelta(hours=23, minutes=25), now=NOW).label == (
        "Reply window open — 35m remaining"
    )


def test_window_unknown_without_inbound_message():
    window = reply_window(None, now=NOW)
    assert window.is_open is False
    assert "unknown" in window.label


def test_payload_requires_interaction_and_body():
    with pytest.raises(ValueError):
        normalize_reply_payload({"body": "hi"})
    with pytest.raises(ValueError):
        normalize_reply_payload({"interaction_id": INTERACTION_ID, "body": "   "})


def test_send_marks_question_answered_and_records_reply():
    client = FakeClient(last_inbound=NOW - timedelta(hours=3))
    sent: list[tuple[str, str]] = []

    def fake_send(to: str, body: str) -> str:
        sent.append((to, body))
        return "wamid.OUT"

    result = send_human_reply(
        {
            "interaction_id": INTERACTION_ID,
            "body": "Yes — sports shoes are fine tomorrow.",
            "sent_by": "admin@tokyois.com",
        },
        client=client,
        send=fake_send,
        now=NOW,
    )

    assert sent == [(WA_FROM, "Yes — sports shoes are fine tomorrow.")]
    assert result["status"] == "sent"
    assert result["wa_message_id"] == "wamid.OUT"
    assert result["window"]["open"] is True

    reply = client.tables["admin_replies"].inserted[0]
    assert reply["status"] == "sent"
    assert reply["session_id"] == SESSION_ID
    assert reply["interaction_id"] == INTERACTION_ID
    assert reply["sent_by"] == "admin@tokyois.com"

    update = client.tables["interactions"].updates[0]
    assert update["human_replied_by"] == "admin@tokyois.com"
    assert update["reviewed_at"] == update["human_replied_at"]


def test_expired_window_blocks_send():
    client = FakeClient(last_inbound=NOW - timedelta(hours=30))
    calls: list[str] = []

    with pytest.raises(ReplyWindowClosed):
        send_human_reply(
            {"interaction_id": INTERACTION_ID, "body": "Too late"},
            client=client,
            send=lambda to, body: calls.append(to),
            now=NOW,
        )

    assert calls == []
    assert client.tables["admin_replies"].inserted == []
    assert client.tables["interactions"].updates == []


def test_failed_send_keeps_question_unanswered_and_is_recorded():
    client = FakeClient(last_inbound=NOW - timedelta(hours=1))

    def broken_send(_to: str, _body: str) -> str:
        raise RuntimeError("429 rate limited")

    with pytest.raises(ReplySendFailed):
        send_human_reply(
            {"interaction_id": INTERACTION_ID, "body": "Draft answer"},
            client=client,
            send=broken_send,
            now=NOW,
        )

    failed = client.tables["admin_replies"].inserted[0]
    assert failed["status"] == "failed"
    assert "429" in failed["error"]
    assert failed["body"] == "Draft answer"
    assert client.tables["interactions"].updates == []


def test_already_reviewed_question_keeps_original_review_stamp():
    client = FakeClient(last_inbound=NOW - timedelta(hours=1), reviewed_at="2026-09-01T00:00:00+00:00")
    send_human_reply(
        {"interaction_id": INTERACTION_ID, "body": "Follow-up answer", "sent_by": "a@b.com"},
        client=client,
        send=lambda _to, _body: "wamid.OUT",
        now=NOW,
    )
    update = client.tables["interactions"].updates[0]
    assert "reviewed_at" not in update
    assert update["human_replied_at"]


def test_unknown_interaction_raises_key_error():
    client = FakeClient(last_inbound=NOW)
    with pytest.raises(KeyError):
        send_human_reply(
            {"interaction_id": "33333333-3333-4333-8333-333333333333", "body": "hi"},
            client=client,
            send=lambda _to, _body: "wamid.OUT",
            now=NOW,
        )
