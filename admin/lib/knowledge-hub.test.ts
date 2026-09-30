import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OTHER,
  OTHER_SLUG,
  categoryLabel,
  entriesInCategory,
  groupCategories,
  showCategoryLanding,
} from "./knowledge-hub.ts";
import type { KnowledgeEntry } from "./types.ts";

function entry(category: string | null, status: "active" | "archived" = "active"): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    primary_question: "Q",
    similar_questions: [],
    answer: "A",
    category,
    tags: [],
    source_note: null,
    origin: "manual",
    origin_interaction_id: null,
    status,
    document_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
  };
}

describe("knowledge hub categories", () => {
  it("always shows category landing", () => {
    assert.equal(showCategoryLanding(0), true);
    assert.equal(showCategoryLanding(50), true);
  });

  it("folds sparse topics into Other and keeps dedicated topics", () => {
    const rows = [
      entry(null),
      entry(""),
      entry("Uniforms"),
      entry("Uniforms"),
      entry("Health"),
      entry("Health"),
      entry("Health"),
      entry("Health"),
      entry("Health", "archived"),
    ];
    const grouped = groupCategories(rows);
    const byName = Object.fromEntries(grouped.map((g) => [g.name, g]));
    assert.equal(byName[OTHER].count, 4);
    assert.equal(byName[OTHER].slug, OTHER_SLUG);
    assert.equal(byName.Health.count, 4);
    assert.equal(byName.Uniforms, undefined);
    assert.equal(categoryLabel(""), OTHER);
    assert.equal(entriesInCategory(rows, null).length, 4);
    assert.equal(entriesInCategory(rows, "Health").length, 4);
  });
});
