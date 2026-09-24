"""Fire-and-forget Web Push notify when a message enters Needs attention."""

from __future__ import annotations

import logging
import os
import threading
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

# Keep in sync with chat_sessions_ui.GAP_OUTCOMES / unanswered_interactions.
GAP_OUTCOMES = frozenset({"no_evidence", "low_confidence"})


def _admin_notify_url() -> str:
    base = (os.environ.get("TINA_ADMIN_URL") or "").strip().rstrip("/")
    if not base:
        # Single-tenant production admin (override with TINA_ADMIN_URL when needed).
        base = "https://admin-lac-zeta.vercel.app"
    return f"{base}/api/push/notify"


def should_notify_outcome(outcome: str | None) -> bool:
    return (outcome or "") in GAP_OUTCOMES


def notify_needs_attention(interaction_id: str, outcome: str | None = None) -> None:
    """Best-effort POST to Tina Admin push notify. Never raises to callers."""
    if not interaction_id:
        return
    if outcome is not None and not should_notify_outcome(outcome):
        return

    url = _admin_notify_url()
    secret = (os.environ.get("ADMIN_SYNC_SECRET") or "").strip()
    if not url or not secret:
        logger.info(
            "push_notify_skip reason=not_configured has_url=%s has_secret=%s",
            bool(url),
            bool(secret),
        )
        return

    def _send() -> None:
        try:
            body = f'{{"interaction_id":"{interaction_id}"}}'.encode("utf-8")
            request = urllib.request.Request(
                url,
                data=body,
                method="POST",
                headers={
                    "Authorization": f"Bearer {secret}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(request, timeout=8) as response:
                logger.info(
                    "push_notify_ok interaction_id=%s status=%s",
                    interaction_id,
                    response.status,
                )
        except urllib.error.HTTPError as exc:
            logger.warning(
                "push_notify_http interaction_id=%s status=%s",
                interaction_id,
                exc.code,
            )
        except Exception:
            logger.exception("push_notify_failed interaction_id=%s", interaction_id)

    threading.Thread(target=_send, name="tina-push-notify", daemon=True).start()
