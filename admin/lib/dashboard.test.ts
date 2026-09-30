import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
