from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request, Response

from tis_agent.ask import answer_question
from tis_agent.whatsapp_config import WhatsAppSettings, get_whatsapp_settings

logger = logging.getLogger("tis_agent.whatsapp")
logging.basicConfig(level=logging.INFO)

GRAPH_API_VERSION = "v21.0"

app = FastAPI(title="Tina WhatsApp webhook", docs_url=None, redoc_url=None)


def _verify_signature(app_secret: str, body: bytes, signature_header: str | None) -> bool:
    if not app_secret:
        return True  # optional during first test
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = signature_header.split("=", 1)[1]
    digest = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, expected)


def send_text(settings: WhatsAppSettings, to: str, body: str) -> None:
    url = (
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/"
        f"{settings.phone_number_id}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": body[:4096]},
    }
    response = httpx.post(
        url,
        headers={
            "Authorization": f"Bearer {settings.token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30.0,
    )
    if response.status_code >= 400:
        logger.error("WhatsApp send failed: %s %s", response.status_code, response.text)
        response.raise_for_status()


def _extract_inbound_messages(payload: dict[str, Any]) -> list[tuple[str, str]]:
    """Return list of (wa_id, text) for inbound user text messages."""
    messages: list[tuple[str, str]] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for msg in value.get("messages") or []:
                if msg.get("type") != "text":
                    continue
                text = ((msg.get("text") or {}).get("body") or "").strip()
                sender = msg.get("from")
                if text and sender:
                    messages.append((sender, text))
    return messages


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tina-whatsapp"}


@app.get("/webhook")
def verify_webhook(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
) -> Response:
    settings = get_whatsapp_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.verify_token:
        return Response(content=hub_challenge or "", media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


def _reply_to_inbound(settings: WhatsAppSettings, sender: str, text: str) -> None:
    """RAG + WhatsApp send — runs after Meta gets a fast 200 ACK."""
    logger.info("Inbound from %s: %s", sender, text[:80])
    try:
        reply = answer_question(text)
    except Exception:
        logger.exception("Tina failed to answer")
        reply = (
            "Sorry — I hit a temporary error looking that up. "
            "Please try again in a moment."
        )
    try:
        send_text(settings, sender, reply)
    except Exception:
        logger.exception("Failed to send WhatsApp reply to %s", sender)


@app.post("/webhook")
async def receive_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    settings = get_whatsapp_settings()
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    if not _verify_signature(settings.app_secret, body, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    for sender, text in _extract_inbound_messages(payload):
        background_tasks.add_task(_reply_to_inbound, settings, sender, text)

    return {"status": "ok"}


def main() -> None:
    import os

    import uvicorn

    get_whatsapp_settings()  # fail fast if misconfigured
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(
        "tis_agent.whatsapp:app",
        host="0.0.0.0",
        port=port,
        reload=False,
    )


if __name__ == "__main__":
    main()
