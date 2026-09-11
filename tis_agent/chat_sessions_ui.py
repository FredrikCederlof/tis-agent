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


PARENT_COLORS = (
    "#05513d",
    "#4d6bff",
    "#9b7bff",
    "#c2410c",
    "#0f766e",
    "#7c3aed",
    "#be185d",
    "#0369a1",
    "#b45309",
    "#15803d",
    "#1d4ed8",
    "#9f1239",
    "#115e59",
    "#6d28d9",
    "#a16207",
    "#0e7490",
    "#b91c1c",
    "#3f6212",
    "#4338ca",
    "#7e22ce",
)


def parent_color_index(wa_from: str | None) -> int:
    """Stable 0–19 slot so the same phone number always gets the same avatar color."""
    text = wa_from or ""
    hashed = 0
    for ch in text:
        hashed = (hashed * 31 + ord(ch)) & 0xFFFFFFFF
    return hashed % len(PARENT_COLORS)


def parent_color(wa_from: str | None) -> str:
    return PARENT_COLORS[parent_color_index(wa_from)]


def parent_initials(wa_from: str | None) -> str:
    digits = "".join(ch for ch in (wa_from or "") if ch.isdigit())
    if len(digits) >= 2:
        return digits[-2:]
    if len(digits) == 1:
        return f"0{digits}"
    return "P"


def question_count_badge(count: int) -> int | None:
    return count if count > 1 else None


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
