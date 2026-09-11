"""Time saved KPI helpers — keep in sync with admin/lib/time-saved.ts."""

from __future__ import annotations

DEFAULT_MINUTES_SAVED_PER_QUESTION = 5
MIN_MINUTES_SAVED_PER_QUESTION = 1
MAX_MINUTES_SAVED_PER_QUESTION = 180


def is_tina_handled(outcome: str, human_replied_at: str | None = None) -> bool:
    """True when interactions.outcome is a grounded Tina success with no human reply."""
    return outcome == "success" and not human_replied_at


def clamp_minutes_per_question(raw: object) -> int:
    try:
        n = round(float(raw))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return DEFAULT_MINUTES_SAVED_PER_QUESTION
    return min(MAX_MINUTES_SAVED_PER_QUESTION, max(MIN_MINUTES_SAVED_PER_QUESTION, n))


def format_saved_time(total_minutes: float) -> str:
    minutes = max(0, round(total_minutes))
    if minutes < 60:
        return f"{minutes}m"
    hours, rest = divmod(minutes, 60)
    if rest == 0:
        return f"{hours}h"
    return f"{hours}h {rest}m"


def time_saved_minutes(handled_count: int, minutes_per_question: object) -> int:
    return max(0, int(handled_count)) * clamp_minutes_per_question(minutes_per_question)


def format_saved_time_delta(current_minutes: float, previous_minutes: float) -> str | None:
    current = max(0, round(current_minutes))
    previous = max(0, round(previous_minutes))
    if previous == 0:
        if current == 0:
            return "→ 0m"
        return f"↑ {format_saved_time(current)}"
    diff = current - previous
    if diff == 0:
        return "→ 0m"
    arrow = "↑" if diff > 0 else "↓"
    return f"{arrow} {format_saved_time(abs(diff))}"
