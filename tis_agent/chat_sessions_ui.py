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
