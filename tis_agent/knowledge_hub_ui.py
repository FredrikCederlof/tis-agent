"""Knowledge Hub list rules shared with Tina Admin (INS-9 / INS-21)."""

from __future__ import annotations

from typing import Any

PAGE_SIZE = 20
SPARSE_CATEGORY_MAX = 3
OTHER = "Other"
OTHER_SLUG = "other"
# Compat aliases
UNCATEGORIZED = OTHER
UNCATEGORIZED_SLUG = OTHER_SLUG
CATEGORY_THRESHOLD = 0
CREATE_SUCCESS_PATH = "/knowledge?added=1"


def create_success_path(*, is_new: bool) -> str:
    """After a successful create, leave the form. Edits stay on the entry."""
    if is_new:
        return CREATE_SUCCESS_PATH
    return ""


def paginate(rows: list[Any], page: int, *, page_size: int = PAGE_SIZE) -> list[Any]:
    if page < 1:
        page = 1
    start = (page - 1) * page_size
    return rows[start : start + page_size]


def page_count(total: int, *, page_size: int = PAGE_SIZE) -> int:
    if total <= 0:
        return 1
    return (total + page_size - 1) // page_size


def show_category_landing(active_count: int) -> bool:
    del active_count
    return True


def category_label(category: str | None) -> str:
    text = (category or "").strip()
    if not text:
        return OTHER
    lower = text.lower()
    if lower in {"uncategorized", "other"}:
        return OTHER
    return text


def category_slug(category: str | None) -> str:
    label = category_label(category)
    if label == OTHER:
        return OTHER_SLUG
    return label


def group_categories(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for row in rows:
        if (row.get("status") or "active") != "active":
            continue
        label = category_label(row.get("category"))
        counts[label] = counts.get(label, 0) + 1

    other_count = 0
    dedicated: list[dict[str, Any]] = []
    for name, count in counts.items():
        if name == OTHER or count <= SPARSE_CATEGORY_MAX:
            other_count += count
            continue
        dedicated.append({"name": name, "slug": category_slug(name), "count": count})

    dedicated.sort(key=lambda item: item["name"].lower())
    if other_count > 0:
        dedicated.append({"name": OTHER, "slug": OTHER_SLUG, "count": other_count})
    return dedicated
