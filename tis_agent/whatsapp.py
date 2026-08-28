from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from collections import OrderedDict
from threading import Lock
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request, Response

from tis_agent.analytics import (
    OUTCOME_ERROR,
    claim_whatsapp_message,
    log_interaction,
    resolve_session_id,
)
from tis_agent.ask import AnswerResult, _reply_language, answer_question
from tis_agent.config import get_settings
from tis_agent.whatsapp_config import WhatsAppSettings, get_whatsapp_settings

import os
from dataclasses import asdict

logger = logging.getLogger("tis_agent.whatsapp")
logging.basicConfig(level=logging.INFO)

GRAPH_API_VERSION = "v21.0"

app = FastAPI(title="Tina WhatsApp webhook", docs_url=None, redoc_url=None)

# Meta may retry webhooks; in-memory dedup is a fast path (DB dedup survives redeploys).
_STALE_MESSAGE_MAX_AGE_S = 24 * 3600
_SEEN_MESSAGE_TTL_S = 24 * 60 * 60
_SEEN_MESSAGE_MAX = 5000
_seen_message_ids: OrderedDict[str, float] = OrderedDict()
_seen_lock = Lock()


def _mark_message_seen(message_id: str) -> bool:
    """Return True if this message was already handled (duplicate webhook)."""
    now = time.time()
    with _seen_lock:
        expired = [mid for mid, ts in _seen_message_ids.items() if now - ts > _SEEN_MESSAGE_TTL_S]
        for mid in expired:
            _seen_message_ids.pop(mid, None)
        if message_id in _seen_message_ids:
            return True
        _seen_message_ids[message_id] = now
        while len(_seen_message_ids) > _SEEN_MESSAGE_MAX:
            _seen_message_ids.popitem(last=False)
        return False


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


def _extract_inbound_messages(payload: dict[str, Any]) -> list[tuple[str, str, str]]:
    """Return list of (message_id, wa_id, text) for inbound user text messages."""
    if payload.get("object") != "whatsapp_business_account":
        return []

    messages: list[tuple[str, str, str]] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") not in (None, "messages"):
                continue
            value = change.get("value") or {}
            # Status/delivery updates — not user questions.
            if value.get("statuses") and not value.get("messages"):
                continue
            for msg in value.get("messages") or []:
                if msg.get("type") != "text":
                    continue
                message_id = msg.get("id")
                text = ((msg.get("text") or {}).get("body") or "").strip()
                sender = msg.get("from")
                if not message_id or not text or not sender:
                    continue
                msg_ts = msg.get("timestamp")
                if msg_ts is not None:
                    try:
                        age_s = time.time() - int(msg_ts)
                        if age_s > _STALE_MESSAGE_MAX_AGE_S:
                            logger.info(
                                "Skipping stale WhatsApp message %s (age %.0fh)",
                                message_id,
                                age_s / 3600,
                            )
                            continue
                    except (TypeError, ValueError):
                        pass
                if _mark_message_seen(message_id):
                    logger.info("Skipping duplicate webhook for message %s", message_id)
                    continue
                messages.append((message_id, sender, text))
    return messages


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tina-whatsapp"}


def _require_admin_sync_token(request: Request) -> None:
    secret = os.environ.get("ADMIN_SYNC_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Admin sync not configured")
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {secret}":
        raise HTTPException(status_code=403, detail="Forbidden")


@app.post("/admin/sync/web")
async def admin_sync_web(request: Request) -> dict[str, object]:
    """Sync public web/calendar sources and login-gated portal sections into Supabase."""
    _require_admin_sync_token(request)
    from tis_agent.web_sync import sync_default_web_sources

    results = sync_default_web_sources()
    return {"results": [asdict(r) for r in results]}


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


def _reply_to_inbound(
    settings: WhatsAppSettings,
    sender: str,
    text: str,
    *,
    wa_message_id: str | None = None,
) -> None:
    """RAG + WhatsApp send — runs after Meta gets a fast 200 ACK."""
    if wa_message_id and not claim_whatsapp_message(
        wa_message_id, sender, text, settings=get_settings()
    ):
        return

    logger.info("Inbound from %s: %s", sender, text[:80])
    app_settings = get_settings()

    try:
        result = answer_question(text, settings=app_settings)
    except Exception:
        logger.exception("Tina failed to answer")
        result = AnswerResult(
            reply=(
                "Sorry — I hit a temporary error looking that up. "
                "Please try again in a moment."
            ),
            language=_reply_language(text),
            outcome=OUTCOME_ERROR,
            evidence_count=0,
            top_similarity=None,
        )

    try:
        send_text(settings, sender, result.reply)
    except Exception:
        logger.exception("Failed to send WhatsApp reply to %s", sender)
        return

    try:
        session_id = resolve_session_id(
            app_settings, sender, language=result.language
        )
        log_interaction(
            session_id=session_id,
            wa_from=sender,
            question=text,
            reply=result.reply,
            language=result.language,
            outcome=result.outcome,
            evidence_count=result.evidence_count,
            top_similarity=result.top_similarity,
            document_titles=result.document_titles,
            wa_message_id=wa_message_id,
            settings=app_settings,
        )
    except Exception:
        logger.exception("Failed to log interaction for %s", sender)


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

    for message_id, sender, text in _extract_inbound_messages(payload):
        background_tasks.add_task(
            _reply_to_inbound,
            settings,
            sender,
            text,
            wa_message_id=message_id,
        )

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
