import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWeeklySeries,
  formatWeekLabel,
  weekStartYmd,
  type DailyPoint,
} from "./dashboard.ts";

function day(key: string, questions: number, success = 0, gaps = 0): DailyPoint {
  return {
    key,
    label: key,
    questions,
    gaps,
    success,
    tinaHandled: success,
    answeredPct: 0,
    attentionPct: 0,
  };
}

describe("weekly performance series", () => {
  it("maps mid-week days to Monday week starts (Tokyo)", () => {
    // 2026-09-30 is Wednesday in Tokyo
    assert.equal(weekStartYmd("2026-09-30"), "2026-09-28");
    assert.equal(weekStartYmd("2026-09-28"), "2026-09-28");
    assert.equal(weekStartYmd("2026-10-04"), "2026-09-28");
    assert.equal(weekStartYmd("2026-10-05"), "2026-10-05");
  });

  it("aggregates daily points into labeled weeks", () => {
    const weeks = buildWeeklySeries([
      day("2026-09-28", 2, 1, 1),
      day("2026-09-30", 3, 2, 1),
      day("2026-10-05", 4, 4, 0),
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
