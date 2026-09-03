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
from fastapi.middleware.cors import CORSMiddleware

from tis_agent.analytics import (
    OUTCOME_ERROR,
    claim_whatsapp_message,
    load_session_history,
    log_interaction,
    peek_session_id,
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


def send_text(settings: WhatsAppSettings, to: str, body: str) -> str | None:
    """Send one WhatsApp text and return the message id Meta assigned it."""
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
    try:
        messages = (response.json() or {}).get("messages") or []
        return messages[0].get("id") if messages else None
    except Exception:
        return None


def send_typing_indicator(
    settings: WhatsAppSettings,
    *,
    message_id: str | None,
) -> None:
    """Mark inbound as read and show the WhatsApp typing indicator (Cloud API)."""
    if not message_id:
        return
    url = (
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/"
        f"{settings.phone_number_id}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id,
        "typing_indicator": {"type": "text"},
    }
    try:
        response = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10.0,
        )
        if response.status_code >= 400:
            logger.warning(
                "Typing indicator failed: %s %s",
                response.status_code,
                response.text[:200],
            )
    except Exception:
        logger.exception("Typing indicator request failed")


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


def _knowledge_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, KeyError):
        return HTTPException(status_code=404, detail=str(exc))
    raise exc


@app.post("/admin/knowledge")
async def admin_create_knowledge(request: Request) -> dict[str, object]:
    """Create a Knowledge Hub entry and ingest it into the existing RAG store."""
    _require_admin_sync_token(request)
    from tis_agent.knowledge import save_knowledge_entry

    try:
        return save_knowledge_entry(await request.json())
    except (ValueError, KeyError) as exc:
        raise _knowledge_http_error(exc) from exc


@app.patch("/admin/knowledge/{entry_id}")
async def admin_update_knowledge(entry_id: str, request: Request) -> dict[str, object]:
    """Update a Knowledge Hub entry and re-ingest the RAG document."""
    _require_admin_sync_token(request)
    from tis_agent.knowledge import save_knowledge_entry

    try:
        return save_knowledge_entry(await request.json(), entry_id=entry_id)
    except (ValueError, KeyError) as exc:
        raise _knowledge_http_error(exc) from exc


@app.post("/admin/knowledge/{entry_id}/archive")
async def admin_archive_knowledge(entry_id: str, request: Request) -> dict[str, object]:
    """Archive a Hub row and delete its RAG document (chunks cascade)."""
    _require_admin_sync_token(request)
    from tis_agent.knowledge import archive_knowledge_entry

    try:
        body = await request.json()
    except Exception:
        body = {}
    try:
        return archive_knowledge_entry(
            entry_id,
            updated_by=str((body or {}).get("updated_by") or "").strip() or None,
        )
    except (ValueError, KeyError) as exc:
        raise _knowledge_http_error(exc) from exc


@app.get("/admin/reply/window")
async def admin_reply_window(request: Request, session_id: str = "") -> dict[str, object]:
    """Is the parent's 24-hour WhatsApp reply window still open for this session?"""
    _require_admin_sync_token(request)
    from tis_agent.human_reply import session_reply_window

    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")
    return session_reply_window(session_id.strip()).as_dict()


@app.post("/admin/reply")
async def admin_send_reply(request: Request) -> dict[str, object]:
    """Send a human answer to the parent in the existing WhatsApp conversation."""
    _require_admin_sync_token(request)
    from tis_agent.human_reply import (
        ReplySendFailed,
        ReplyWindowClosed,
        send_human_reply,
    )

    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    try:
        return send_human_reply(body)
    except ReplyWindowClosed as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ReplySendFailed as exc:
        raise HTTPException(
            status_code=502,
            detail=f"WhatsApp did not accept the reply: {exc}",
        ) from exc
    except (ValueError, KeyError) as exc:
        raise _knowledge_http_error(exc) from exc


@app.get("/admin/knowledge/related")
async def admin_related_knowledge(request: Request, q: str = "") -> dict[str, object]:
    """Warn before create when a similar Knowledge Hub entry already exists."""
    _require_admin_sync_token(request)
    from tis_agent.knowledge import related_knowledge_entries

    return {"results": related_knowledge_entries(q)}


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
    send_typing_indicator(settings, message_id=wa_message_id)
    app_settings = get_settings()
    history: list[dict[str, str]] = []
    try:
        prior_session = peek_session_id(app_settings, sender)
        if prior_session:
            history = load_session_history(app_settings, prior_session, limit=5)
    except Exception:
        logger.exception("Failed to load chat history for %s", sender)

    started = time.perf_counter()
    try:
        result = answer_question(text, settings=app_settings, history=history)
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
    logger.info(
        "Answered %s outcome=%s evidence=%d elapsed=%.2fs",
        sender,
        result.outcome,
        result.evidence_count,
        time.perf_counter() - started,
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
