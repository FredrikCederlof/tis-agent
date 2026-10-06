import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OTHER,
  OTHER_SLUG,
  categoryLabel,
  categoryPageSubtitle,
  effectiveKnowledgeStatus,
  entriesInCategory,
  filterKnowledgeList,
  groupCategories,
  isReviewOverdue,
  knowledgeListStatusLabel,
  knowledgeListTabCounts,
  showCategoryLanding,
  sortKnowledgeList,
} from "./knowledge-hub.ts";
import type { KnowledgeEntry } from "./types.ts";

function entry(
  category: string | null,
  status: KnowledgeEntry["status"] = "active",
  overrides: Partial<KnowledgeEntry> = {},
): KnowledgeEntry {
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
    valid_until: null,
    review_due_date: null,
    content_owner: null,
    source_url: null,
    audience: ["All"],
    exclusion_notes: null,
    last_ingested_at: null,
    document_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...overrides,
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
    // Category lists include non-active rows in the same dedicated bucket.
    assert.equal(entriesInCategory(rows, "Health").length, 5);
  });

  it("lists draft and expired rows inside Other when the topic is sparse", () => {
    const rows = [
      entry("Uniforms", "active"),
      entry("Uniforms", "draft", { primary_question: "Draft uniforms" }),
      entry("Uniforms", "expired", {
        primary_question: "Expired uniforms",
        valid_until: "2020-01-01",
      }),
    ];
    const other = entriesInCategory(rows, null);
    assert.equal(other.length, 3);
    assert.ok(other.some((row) => row.status === "draft"));
    assert.ok(other.some((row) => row.status === "expired"));
  });

  it("resolves expired and review overdue without removing active counts for future dates", () => {
    const expired = entry("Health");
    expired.valid_until = "2020-01-01";
    assert.equal(effectiveKnowledgeStatus(expired, "2026-10-06"), "expired");
    const overdue = entry("Health");
    overdue.review_due_date = "2026-01-01";
    assert.equal(isReviewOverdue(overdue, "2026-10-06"), true);
    assert.equal(effectiveKnowledgeStatus(overdue, "2026-10-06"), "active");
  });

  it("describes Other vs named categories", () => {
    assert.match(categoryPageSubtitle(OTHER), /doesn't belong/i);
    assert.match(categoryPageSubtitle("Health"), /Health/);
  });
});

describe("knowledge list filters and sort", () => {
  const today = "2026-10-06";

  it("filters by status tab, audience, owner, and origin", () => {
    const rows = [
      entry("Health", "active", {
        primary_question: "Active all",
        audience: ["All"],
        content_owner: "TIS Office",
        origin: "manual",
      }),
      entry("Health", "draft", {
        primary_question: "Draft parents",
        audience: ["Parents"],
        content_owner: "Admissions",
        origin: "inbox",
      }),
      entry("Health", "active", {
        primary_question: "Needs review",
        review_due_date: "2026-01-01",
        content_owner: "TIS Office",
      }),
      entry("Health", "expired", {
        primary_question: "Expired",
        valid_until: "2020-01-01",
      }),
    ];

    assert.equal(filterKnowledgeList(rows, { statusTab: "draft", todayIso: today }).length, 1);
    assert.equal(
      filterKnowledgeList(rows, { statusTab: "needs_review", todayIso: today }).length,
      1,
    );
    assert.equal(
      filterKnowledgeList(rows, { audience: "Parents", todayIso: today }).length,
      1,
    );
    assert.equal(
      filterKnowledgeList(rows, { owner: "TIS Office", todayIso: today }).length,
      2,
    );
    assert.equal(filterKnowledgeList(rows, { origin: "inbox", todayIso: today }).length, 1);
  });

  it("sorts by question and status labels", () => {
    const rows = [
      entry(null, "active", { primary_question: "Zebra", id: "1" }),
      entry(null, "draft", { primary_question: "Alpha", id: "2" }),
      entry(null, "active", {
        primary_question: "Beta",
        id: "3",
        review_due_date: "2026-01-01",
      }),
    ];
    const byQuestion = sortKnowledgeList(rows, "question", "asc", today);
    assert.deepEqual(
      byQuestion.map((row) => row.primary_question),
      ["Alpha", "Beta", "Zebra"],
    );
    const byStatus = sortKnowledgeList(rows, "status", "asc", today);
    assert.equal(knowledgeListStatusLabel(byStatus[0], today), "Review due");
    assert.equal(knowledgeListStatusLabel(byStatus[1], today), "Draft");
    assert.equal(knowledgeListStatusLabel(byStatus[2], today), "Active");
  });

  it("counts status tabs including needs review", () => {
    const rows = [
      entry(null, "active"),
      entry(null, "active", { review_due_date: "2026-01-01" }),
      entry(null, "draft"),
      entry(null, "expired", { valid_until: "2020-01-01" }),
    ];
    const counts = knowledgeListTabCounts(rows, today);
    assert.equal(counts.all, 4);
    assert.equal(counts.active, 2);
    assert.equal(counts.needs_review, 1);
    assert.equal(counts.draft, 1);
    assert.equal(counts.expired, 1);
  });
});
