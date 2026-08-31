"""Knowledge Hub start-page rules (INS-9)."""

from tis_agent.knowledge_hub_ui import (
    CATEGORY_THRESHOLD,
    CREATE_SUCCESS_PATH,
    PAGE_SIZE,
    UNCATEGORIZED,
    UNCATEGORIZED_SLUG,
    category_label,
    create_success_path,
    group_categories,
    page_count,
    paginate,
    show_category_landing,
)


def test_create_redirects_home_not_edit_form() -> None:
    assert create_success_path(is_new=True) == CREATE_SUCCESS_PATH
    assert create_success_path(is_new=True) == "/knowledge?added=1"
    assert "/knowledge/" not in create_success_path(is_new=True)
    assert create_success_path(is_new=False) == ""


def test_paginate_slices_after_twenty() -> None:
    rows = [f"row-{i}" for i in range(21)]
    assert PAGE_SIZE == 20
    assert paginate(rows, 1) == rows[:20]
    assert paginate(rows, 2) == ["row-20"]
    assert page_count(21) == 2
    assert page_count(20) == 1


def test_category_landing_after_one_hundred_active() -> None:
    assert show_category_landing(CATEGORY_THRESHOLD) is False
    assert show_category_landing(CATEGORY_THRESHOLD + 1) is True


def test_group_categories_uses_uncategorized_bucket() -> None:
    rows = [
        {"status": "active", "category": "School hours"},
        {"status": "active", "category": "School hours"},
        {"status": "active", "category": ""},
        {"status": "active", "category": None},
        {"status": "archived", "category": "School hours"},
    ]
    grouped = group_categories(rows)
    by_name = {item["name"]: item for item in grouped}
    assert by_name["School hours"]["count"] == 2
    assert by_name[UNCATEGORIZED]["count"] == 2
    assert by_name[UNCATEGORIZED]["slug"] == UNCATEGORIZED_SLUG
    assert category_label("") == UNCATEGORIZED
    assert category_label("  ") == UNCATEGORIZED
    assert [item["name"] for item in grouped][-1] == UNCATEGORIZED
