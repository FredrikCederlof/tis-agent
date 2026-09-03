"""Admin Chats helpers (INS-11) — keep in sync with admin/lib/chats.ts."""

from __future__ import annotations

from datetime import datetime

PAGE_SIZE = 20
GAP_OUTCOMES = frozenset({"no_evidence", "low_confidence"})


def is_unread(admin_read_at: datetime | str | None, last_message_at: datetime | str | None) -> bool:
    if last_message_at is None:
        return admin_read_at is None
    if admin_read_at is None:
        return True
    return last_message_at > admin_read_at


def parent_label(wa_from: str | None) -> str:
    digits = "".join(ch for ch in (wa_from or "") if ch.isdigit())
    if len(digits) >= 4:
        return f"Parent ·••{digits[-4:]}"
    if digits:
        return f"Parent ·••{digits}"
    return "Parent"


def parent_hue(wa_from: str | None) -> int:
    """Stable 0–359 hue so the same parent always gets the same avatar color."""
    text = wa_from or ""
    total = sum(ord(ch) for ch in text)
    return total % 360


def needs_attention(interaction: dict) -> bool:
    """Auto gaps or a manual flag, while still unreviewed."""
    if interaction.get("reviewed_at"):
        return False
    if interaction.get("manual_attention_at"):
        return True
    return interaction.get("outcome") in GAP_OUTCOMES


def build_timeline(interactions: list[dict], admin_replies: list[dict] | None = None) -> list[dict]:
    """Merge parent questions, Tina answers, and admin replies into one thread."""
    messages: list[dict] = []
    for item in interactions:
        created_at = item.get("created_at")
        messages.append(
            {
                "id": f"{item['id']}:parent",
                "kind": "parent",
                "text": item.get("question") or "",
                "at": created_at,
                "interaction_id": item["id"],
                "outcome": item.get("outcome"),
                "needs_attention": needs_attention(item),
            }
        )
        if item.get("reply"):
            messages.append(
                {
                    "id": f"{item['id']}:tina",
                    "kind": "tina",
                    "text": item["reply"],
                    "at": created_at,
                    "interaction_id": item["id"],
                    "outcome": item.get("outcome"),
                    "needs_attention": False,
                }
            )
    for reply in admin_replies or []:
        messages.append(
            {
                "id": f"{reply['id']}:admin",
                "kind": "admin",
                "text": reply.get("body") or "",
                "at": reply.get("created_at"),
                "interaction_id": reply.get("interaction_id"),
                "status": reply.get("status") or "sent",
                "sent_by": reply.get("sent_by"),
                "needs_attention": False,
            }
        )
    # Question, then Tina, then any admin reply when timestamps match.
    rank = {"parent": 0, "tina": 1, "admin": 2}
    messages.sort(key=lambda message: (message.get("at") or "", rank[message["kind"]]))
    return messages


def reply_target(interactions: list[dict]) -> dict | None:
    """Oldest question still needing attention, else the most recent question."""
    pending = [item for item in interactions if needs_attention(item)]
    if pending:
        return min(pending, key=lambda item: item.get("created_at") or "")
    if not interactions:
        return None
    return max(interactions, key=lambda item: item.get("created_at") or "")


def same_parent_other_sessions_remain(
    sessions: list[dict],
    *,
    deleted_id: str,
    wa_from: str,
) -> bool:
    """True when deleting one session leaves other sessions for the same parent."""
    remaining = [
        row
        for row in sessions
        if row.get("id") != deleted_id and row.get("wa_from") == wa_from
    ]
    return bool(remaining)
