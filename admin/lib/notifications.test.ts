import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOTIFY_CHOICE_KEY,
  NOTIFY_SEEN_KEY,
  diffAttentionNotifications,
  notificationBodyForCount,
  readNotifyChoice,
  readSeenIds,
  seedSeenIds,
  writeNotifyChoice,
  writeSeenIds,
} from "./notifications.ts";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = { ...initial };
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key];
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  };
}

describe("notify choice persistence", () => {
  it("returns null until the user chooses", () => {
    const storage = memoryStorage();
    assert.equal(readNotifyChoice(storage), null);
  });

  it("persists enabled and dismissed without re-prompting", () => {
    const storage = memoryStorage();
    writeNotifyChoice("enabled", storage);
    assert.equal(readNotifyChoice(storage), "enabled");
    assert.equal(storage.getItem(NOTIFY_CHOICE_KEY), "enabled");

    writeNotifyChoice("dismissed", storage);
    assert.equal(readNotifyChoice(storage), "dismissed");
  });

  it("ignores unknown stored values", () => {
    const storage = memoryStorage({ [NOTIFY_CHOICE_KEY]: "maybe" });
    assert.equal(readNotifyChoice(storage), null);
  });
});

describe("seen ids", () => {
  it("seeds backlog so existing queue items do not notify", () => {
    const seeded = seedSeenIds(["a", "b"], []);
    assert.deepEqual(seeded, ["a", "b"]);
    const again = diffAttentionNotifications(["a", "b"], seeded);
    assert.deepEqual(again.notifyIds, []);
    assert.deepEqual(again.nextSeen, ["a", "b"]);
  });

  it("notifies only new ids and marks them seen", () => {
    const { notifyIds, nextSeen } = diffAttentionNotifications(["a", "b", "c"], ["a", "b"]);
    assert.deepEqual(notifyIds, ["c"]);
    assert.deepEqual(nextSeen, ["a", "b", "c"]);
  });

  it("does not duplicate notifications for the same id", () => {
    const first = diffAttentionNotifications(["x"], []);
    assert.deepEqual(first.notifyIds, ["x"]);
    const second = diffAttentionNotifications(["x"], first.nextSeen);
    assert.deepEqual(second.notifyIds, []);
  });

  it("prunes left-queue ids so a later re-flag can notify again", () => {
    const afterLeave = diffAttentionNotifications([], ["old"]);
    assert.deepEqual(afterLeave.notifyIds, []);
    assert.deepEqual(afterLeave.nextSeen, []);
    const reflagged = diffAttentionNotifications(["old"], afterLeave.nextSeen);
    assert.deepEqual(reflagged.notifyIds, ["old"]);
  });

  it("round-trips seen ids through storage", () => {
    const storage = memoryStorage();
    writeSeenIds(["1", "2"], storage);
    assert.equal(storage.getItem(NOTIFY_SEEN_KEY), JSON.stringify(["1", "2"]));
    assert.deepEqual(readSeenIds(storage), ["1", "2"]);
  });
});

describe("notification copy", () => {
  it("avoids message content and stays generic", () => {
    assert.equal(
      notificationBodyForCount(1),
      "A parent message needs attention in Tina Admin.",
    );
    assert.equal(
      notificationBodyForCount(3),
      "3 parent messages need attention in Tina Admin.",
    );
  });
});
