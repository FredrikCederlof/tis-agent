import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attentionReason,
  formatChartDayLabel,
  rankTopQuestions,
} from "./dashboard.ts";
import {
  buildWeeklySeries,
  formatWeekLabel,
  weekStartYmd,
} from "./tokyo-weeks.ts";

describe("weekly performance series", () => {
  it("maps mid-week days to Monday week starts (Tokyo)", () => {
    assert.equal(weekStartYmd("2026-09-30"), "2026-09-28");
    assert.equal(weekStartYmd("2026-09-28"), "2026-09-28");
    assert.equal(weekStartYmd("2026-10-04"), "2026-09-28");
    assert.equal(weekStartYmd("2026-10-05"), "2026-10-05");
  });

  it("aggregates daily points into labeled weeks", () => {
    const weeks = buildWeeklySeries([
      { key: "2026-09-28", questions: 2, success: 1, gaps: 1, tinaHandled: 1 },
      { key: "2026-09-30", questions: 3, success: 2, gaps: 1, tinaHandled: 2 },
      { key: "2026-10-05", questions: 4, success: 4, gaps: 0, tinaHandled: 4 },
    ]);
    assert.equal(weeks.length, 2);
    assert.equal(weeks[0].key, "2026-09-28");
    assert.equal(weeks[0].questions, 5);
    assert.equal(weeks[0].success, 3);
    assert.equal(weeks[0].gaps, 2);
    assert.equal(weeks[0].answeredPct, 60);
    assert.equal(weeks[0].label, formatWeekLabel("2026-09-28"));
    assert.equal(weeks[1].key, "2026-10-05");
    assert.equal(weeks[1].questions, 4);
    assert.equal(weeks[1].answeredPct, 100);
  });
});

describe("dashboard ranking helpers", () => {
  it("ranks top questions across outcomes", () => {
    const ranked = rankTopQuestions(
      [
        { created_at: "2026-10-01T00:00:00Z", outcome: "success", question: "When is sports day?" },
        { created_at: "2026-10-01T01:00:00Z", outcome: "no_evidence", question: "When is sports day?" },
        { created_at: "2026-10-01T02:00:00Z", outcome: "success", question: "Uniform policy?" },
      ],
      5,
    );
    assert.equal(ranked[0].topic, "When is sports day?");
    assert.equal(ranked[0].count, 2);
    assert.equal(ranked[1].count, 1);
  });

  it("formats chart day labels", () => {
    assert.match(formatChartDayLabel("2026-09-28"), /^Mon\s+28$/);
  });

  it("maps attention reasons to dashboard status pills", () => {
    assert.equal(attentionReason("no_evidence").label, "Unanswered");
    assert.equal(attentionReason("low_confidence").label, "Needs review");
  });
});
