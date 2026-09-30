"""Knowledge Hub UI helpers (INS-9 / INS-21)."""

from tis_agent.knowledge_hub_ui import (
    OTHER,
    OTHER_SLUG,
    SPARSE_CATEGORY_MAX,
    category_label,
    group_categories,
    show_category_landing,
)


def test_show_category_landing_always_true() -> None:
    assert show_category_landing(0) is True
    assert show_category_landing(3) is True
    assert show_category_landing(100) is True


def test_group_categories_folds_sparse_into_other() -> None:
    rows = [
        {"status": "active", "category": None},
        {"status": "active", "category": ""},
        {"status": "active", "category": "Uniforms"},
        {"status": "active", "category": "Uniforms"},
        {"status": "active", "category": "Health"},
        {"status": "active", "category": "Health"},
        {"status": "active", "category": "Health"},
        {"status": "active", "category": "Health"},
        {"status": "archived", "category": "Health"},
    ]
    grouped = group_categories(rows)
    by_name = {item["name"]: item for item in grouped}
    assert OTHER in by_name
    # 2 blank + 2 Uniforms (sparse) → Other; Health has 4 → dedicated
    assert by_name[OTHER]["count"] == 4
    assert by_name[OTHER]["slug"] == OTHER_SLUG
    assert by_name["Health"]["count"] == 4
    assert "Uniforms" not in by_name
    assert category_label("") == OTHER
    assert category_label("  ") == OTHER
    assert [item["name"] for item in grouped][-1] == OTHER
    assert SPARSE_CATEGORY_MAX == 3
