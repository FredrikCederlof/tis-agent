import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currentTokyoMonthKey,
  groupConversationsByMonth,
  monthKeyFromIso,
  monthLabelFromKey,
  titleFromQuestion,
  type SandboxConversation,
} from "./sandbox.ts";

describe("sandbox helpers", () => {
  it("titles and truncates first questions", () => {
    assert.equal(titleFromQuestion("  Hi  "), "Hi");
    assert.equal(
      titleFromQuestion("A".repeat(70)).endsWith("…"),
      true,
    );
  });

  it("groups conversations into Tokyo month folders", () => {
    const rows: SandboxConversation[] = [
      {
        id: "1",
        title: "Buses",
        created_at: "2026-09-15T01:00:00.000Z",
        updated_at: "2026-09-15T01:00:00.000Z",
      },
      {
        id: "2",
        title: "Absence",
        created_at: "2026-08-10T01:00:00.000Z",
        updated_at: "2026-08-10T01:00:00.000Z",
      },
    ];
    const folders = groupConversationsByMonth(rows);
    assert.equal(folders.length, 2);
    assert.equal(folders[0].key, "2026-09");
    assert.equal(folders[0].label, "September 2026");
    assert.equal(folders[1].key, "2026-08");
    assert.ok(monthKeyFromIso("2026-09-30T00:00:00.000Z").startsWith("2026-"));
    assert.equal(monthLabelFromKey("2026-09"), "September 2026");
    assert.match(currentTokyoMonthKey(), /^\d{4}-\d{2}$/);
  });
});
