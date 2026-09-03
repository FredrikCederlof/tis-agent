"""POST /admin/reply — auth, success, expired window, and failed send."""

import os

import pytest
from fastapi.testclient import TestClient

from tis_agent import human_reply, whatsapp

INTERACTION_ID = "11111111-1111-4111-8111-111111111111"
SECRET = "test-admin-secret"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setitem(os.environ, "ADMIN_SYNC_SECRET", SECRET)
    return TestClient(whatsapp.app)


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {SECRET}"}


def test_reply_requires_admin_token(client):
    response = client.post("/admin/reply", json={"interaction_id": INTERACTION_ID, "body": "hi"})
    assert response.status_code == 403


def test_reply_returns_sent_payload(client, monkeypatch):
    def fake_send(payload, **_kwargs):
        assert payload["interaction_id"] == INTERACTION_ID
        assert payload["body"] == "Yes, sports shoes are fine tomorrow."
        return {
            "status": "sent",
            "interaction_id": INTERACTION_ID,
            "wa_message_id": "wamid.OUT",
            "answered_at": "2026-09-03T12:00:00+00:00",
            "window": {"open": True, "label": "Reply window open — 21h remaining"},
        }

    monkeypatch.setattr(human_reply, "send_human_reply", fake_send)
    response = client.post(
        "/admin/reply",
        headers=auth(),
        json={
            "interaction_id": INTERACTION_ID,
            "body": "Yes, sports shoes are fine tomorrow.",
            "sent_by": "admin@tokyois.com",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "sent"
    assert response.json()["wa_message_id"] == "wamid.OUT"


def test_expired_window_returns_409(client, monkeypatch):
    def closed(_payload, **_kwargs):
        raise human_reply.ReplyWindowClosed("The 24-hour WhatsApp reply window has expired")

    monkeypatch.setattr(human_reply, "send_human_reply", closed)
    response = client.post(
        "/admin/reply",
        headers=auth(),
        json={"interaction_id": INTERACTION_ID, "body": "Too late"},
    )
    assert response.status_code == 409
    assert "expired" in response.json()["detail"]


def test_failed_send_returns_502_so_admin_can_retry(client, monkeypatch):
    def broken(_payload, **_kwargs):
        raise human_reply.ReplySendFailed("429 rate limited")

    monkeypatch.setattr(human_reply, "send_human_reply", broken)
    response = client.post(
        "/admin/reply",
        headers=auth(),
        json={"interaction_id": INTERACTION_ID, "body": "Draft answer"},
    )
    assert response.status_code == 502
    assert "429" in response.json()["detail"]


def test_missing_body_returns_400(client, monkeypatch):
    monkeypatch.setattr(
        human_reply,
        "send_human_reply",
        lambda payload, **_kwargs: human_reply.normalize_reply_payload(payload),
    )
    response = client.post(
        "/admin/reply",
        headers=auth(),
        json={"interaction_id": INTERACTION_ID, "body": "  "},
    )
    assert response.status_code == 400


def test_window_endpoint_requires_session_id(client):
    assert client.get("/admin/reply/window", headers=auth()).status_code == 400
