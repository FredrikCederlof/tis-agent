"""Scan open Needs attention items and Slack-remind before the 24h window closes."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from tis_agent.clients import make_supabase
from tis_agent.config import Settings, get_settings
from tis_agent.human_reply import (
    REPLY_WINDOW_HOURS,
    format_remaining,
    reply_window,
)
from tis_agent.slack_notify import (
    GAP_OUTCOMES,
    REMINDER_MILESTONES,
    mark_reminder_milestones,
    next_reminder_milestone,
    notify_needs_attention,
    notify_window_reminder,
)

logger = logging.getLogger(__name__)

# How often the WhatsApp process wakes the scanner (seconds).
REMINDER_LOOP_SECONDS = 10 * 60


def _is_open_needs_attention(row: dict[str, Any]) -> bool:
    if row.get("reviewed_at") or row.get("human_replied_at"):
        return False
    if row.get("manual_attention_at"):
        return True
    return (row.get("outcome") or "") in GAP_OUTCOMES


def _load_open_attention(client: Any) -> list[dict[str, Any]]:
    """Open Needs attention rows (auto gaps + manual), newest first."""
    # Prefer the view when available; fall back to interactions filter.
    try:
        response = (
            client.table("unanswered_interactions")
            .select(
                "id, session_id, wa_from, question, reply, outcome, language, "
                "wa_message_id, created_at, reviewed_at, human_replied_at, "
                "manual_attention_at"
            )
            .limit(200)
            .execute()
        )
        return list(response.data or [])
    except Exception:
        logger.exception("unanswered_interactions query failed; using interactions")
        response = (
            client.table("interactions")
            .select(
                "id, session_id, wa_from, question, reply, outcome, language, "
                "wa_message_id, created_at, reviewed_at, human_replied_at, "
                "manual_attention_at"
            )
            .is_("reviewed_at", "null")
            .limit(500)
            .execute()
        )
        return [row for row in (response.data or []) if _is_open_needs_attention(row)]


def _last_inbound_by_parent(client: Any, wa_froms: list[str]) -> dict[str, Any]:
    """Newest interaction created_at per parent (proxy for last inbound)."""
    result: dict[str, Any] = {}
    for wa_from in wa_froms:
        if not wa_from or wa_from in result:
            continue
        try:
            response = (
                client.table("interactions")
                .select("created_at")
                .eq("wa_from", wa_from)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            if rows:
                result[wa_from] = rows[0].get("created_at")
        except Exception:
            logger.exception("last inbound lookup failed for parent")
    return result


def _sent_milestones(client: Any, interaction_ids: list[str]) -> dict[str, set[str]]:
    if not interaction_ids:
        return {}
    try:
        response = (
            client.table("slack_attention_reminders")
            .select("interaction_id, milestone")
            .in_("interaction_id", interaction_ids)
            .execute()
        )
    except Exception:
        logger.exception("slack_attention_reminders load failed")
        return {}
    out: dict[str, set[str]] = {}
    for row in response.data or []:
        iid = str(row.get("interaction_id") or "")
        milestone = str(row.get("milestone") or "")
        if not iid or not milestone:
            continue
        out.setdefault(iid, set()).add(milestone)
    return out


def run_attention_reminders(
    *,
    settings: Settings | None = None,
    client: Any | None = None,
    now: datetime | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Post Slack reminders for open Needs attention items nearing window close.

    Milestones (once each): ~4h left, then ~1h left. Never raises to callers.
    """
    moment = now or datetime.now(timezone.utc)
    summary: dict[str, Any] = {
        "status": "ok",
        "scanned": 0,
        "open_window": 0,
        "reminded": 0,
        "skipped": 0,
        "milestones": [],
        "window_hours": REPLY_WINDOW_HOURS,
    }
    try:
        settings = settings or get_settings()
        sb = client or make_supabase(settings)
        rows = _load_open_attention(sb)
        summary["scanned"] = len(rows)
        if not rows:
            return summary

        wa_froms = sorted({str(r.get("wa_from") or "") for r in rows if r.get("wa_from")})
        last_inbound = _last_inbound_by_parent(sb, wa_froms)
        already = _sent_milestones(sb, [str(r["id"]) for r in rows if r.get("id")])

        for row in rows:
            interaction_id = str(row.get("id") or "")
            wa_from = str(row.get("wa_from") or "")
            if not interaction_id or not wa_from:
                summary["skipped"] += 1
                continue

            window = reply_window(last_inbound.get(wa_from), now=moment)
            if not window.is_open or window.remaining_seconds <= 0:
                summary["skipped"] += 1
                continue
            summary["open_window"] += 1

            sent = already.get(interaction_id, set())
            milestone = next_reminder_milestone(window.remaining_seconds, sent)
            if not milestone:
                summary["skipped"] += 1
                continue

            # Mark looser milestones satisfied when jumping straight into a tighter band.
            to_mark = mark_reminder_milestones(milestone)
            if dry_run:
                summary["reminded"] += 1
                summary["milestones"].append(
                    {
                        "interaction_id": interaction_id,
                        "milestone": milestone,
                        "remaining_seconds": window.remaining_seconds,
                        "dry_run": True,
                    }
                )
                continue

            notify_window_reminder(
                question=str(row.get("question") or ""),
                reply=row.get("reply"),
                wa_from=wa_from,
                outcome=str(row.get("outcome") or "needs_attention"),
                session_id=str(row.get("session_id") or "") or None,
                language=str(row.get("language") or "") or None,
                wa_message_id=str(row.get("wa_message_id") or "") or None,
                milestone=milestone,
                remaining_seconds=window.remaining_seconds,
                expires_at=window.expires_at,
            )

            try:
                for name in to_mark:
                    sb.table("slack_attention_reminders").upsert(
                        {
                            "interaction_id": interaction_id,
                            "milestone": name,
                            "sent_at": moment.isoformat(),
                        },
                        on_conflict="interaction_id,milestone",
                    ).execute()
            except Exception:
                logger.exception(
                    "failed to record slack reminder interaction_id=%s milestone=%s",
                    interaction_id,
                    milestone,
                )

            summary["reminded"] += 1
            summary["milestones"].append(
                {
                    "interaction_id": interaction_id,
                    "milestone": milestone,
                    "remaining_seconds": window.remaining_seconds,
                    "label": format_remaining(window.remaining_seconds),
                }
            )
    except Exception:
        logger.exception("run_attention_reminders failed")
        summary["status"] = "error"
    return summary


def notify_interaction_needs_attention(
    interaction_id: str,
    *,
    settings: Settings | None = None,
    client: Any | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Load one interaction and post to #tina-needs-attention if still open.

    Used for manual Admin flags (Railway admin endpoint). Never raises.
    """
    result: dict[str, Any] = {"status": "ok", "posted": False}
    if not interaction_id:
        result["status"] = "skipped"
        result["reason"] = "missing_id"
        return result
    try:
        settings = settings or get_settings()
        sb = client or make_supabase(settings)
        response = (
            sb.table("interactions")
            .select(
                "id, session_id, wa_from, question, reply, outcome, language, "
                "wa_message_id, reviewed_at, human_replied_at, manual_attention_at"
            )
            .eq("id", interaction_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            result["status"] = "skipped"
            result["reason"] = "not_found"
            return result
        row = rows[0]
        if not _is_open_needs_attention(row):
            result["status"] = "skipped"
            result["reason"] = "not_needs_attention"
            return result

        wa_from = str(row.get("wa_from") or "")
        window = None
        if wa_from:
            inbound = (
                sb.table("interactions")
                .select("created_at")
                .eq("wa_from", wa_from)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            last = (inbound.data or [{}])[0].get("created_at")
            window = reply_window(last, now=now)

        notify_needs_attention(
            question=str(row.get("question") or ""),
            reply=row.get("reply"),
            wa_from=wa_from or None,
            outcome=str(row.get("outcome") or "manual"),
            session_id=str(row.get("session_id") or "") or None,
            language=str(row.get("language") or "") or None,
            wa_message_id=str(row.get("wa_message_id") or "") or None,
            remaining_seconds=window.remaining_seconds if window else None,
            expires_at=window.expires_at if window else None,
            force=True,
        )
        result["posted"] = True
        if window:
            result["remaining_seconds"] = window.remaining_seconds
            result["window_label"] = window.label
        return result
    except Exception:
        logger.exception(
            "notify_interaction_needs_attention failed id=%s", interaction_id
        )
        result["status"] = "error"
        return result


def start_reminder_loop() -> None:
    """Daemon thread: scan for 24h-window reminders while WhatsApp is up."""
    import threading
    import time

    def _loop() -> None:
        # Small delay so boot / healthcheck is not delayed by first scan.
        time.sleep(30)
        while True:
            try:
                summary = run_attention_reminders()
                logger.info(
                    "slack_attention_reminders scanned=%s open=%s reminded=%s",
                    summary.get("scanned"),
                    summary.get("open_window"),
                    summary.get("reminded"),
                )
            except Exception:
                logger.exception("slack reminder loop iteration failed")
            time.sleep(REMINDER_LOOP_SECONDS)

    threading.Thread(target=_loop, name="tina-slack-reminders", daemon=True).start()
    logger.info(
        "slack reminder loop started interval_s=%s milestones=%s",
        REMINDER_LOOP_SECONDS,
        [m[0] for m in REMINDER_MILESTONES],
    )
