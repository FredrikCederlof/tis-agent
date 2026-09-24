import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOTIFY_CHOICE_KEY,
  deliveryIdempotencyKey,
  isNeedsAttentionUnanswered,
  notificationPayloadForInteraction,
  readNotifyChoice,
  resolveNotifyUiState,
  validatePushSubscriptionPayload,
  writeNotifyChoice,
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
});

describe("UI states", () => {
  it("maps permission and choice to stable labels", () => {
    assert.equal(
      resolveNotifyUiState({ supported: false, choice: null, permission: null }),
      "unsupported",
    );
    assert.equal(
      resolveNotifyUiState({ supported: true, choice: null, permission: "default" }),
      "prompt",
    );
    assert.equal(
      resolveNotifyUiState({
        supported: true,
        choice: "enabled",
        permission: "granted",
      }),
      "enabled",
    );
    assert.equal(
      resolveNotifyUiState({ supported: true, choice: "dismissed", permission: "denied" }),
      "blocked",
    );
    assert.equal(
      resolveNotifyUiState({
        supported: true,
        choice: "dismissed",
        permission: "default",
      }),
      "not_enabled",
    );
  });
});

describe("needs attention eligibility", () => {
  it("notifies for unanswered gap outcomes and manual flags", () => {
    assert.equal(
      isNeedsAttentionUnanswered({
        id: "1",
        outcome: "no_evidence",
        reviewed_at: null,
        human_replied_at: null,
      }),
      true,
    );
    assert.equal(
      isNeedsAttentionUnanswered({
        id: "2",
        outcome: "success",
        manual_attention_at: "2026-09-24T00:00:00Z",
        reviewed_at: null,
      }),
      true,
    );
  });

  it("skips answered, reviewed, or non-attention messages", () => {
    assert.equal(
      isNeedsAttentionUnanswered({
        id: "3",
        outcome: "success",
        reviewed_at: null,
      }),
      false,
    );
    assert.equal(
      isNeedsAttentionUnanswered({
        id: "4",
        outcome: "no_evidence",
        reviewed_at: "2026-09-24T00:00:00Z",
      }),
      false,
    );
    assert.equal(
      isNeedsAttentionUnanswered({
        id: "5",
        outcome: "no_evidence",
        human_replied_at: "2026-09-24T00:00:00Z",
      }),
      false,
    );
  });
});

describe("idempotency and payload", () => {
  it("builds a stable user+message key", () => {
    assert.equal(deliveryIdempotencyKey("u1", "i1"), "u1:i1");
  });

  it("keeps notification text free of message content", () => {
    const payload = notificationPayloadForInteraction("abc");
    assert.equal(payload.title, "Tina Admin");
    assert.match(payload.body, /needs attention/i);
    assert.equal(payload.tag, "needs-attention-abc");
    assert.equal(payload.data.url, "/inbox");
    assert.equal(payload.data.interactionId, "abc");
    assert.equal(payload.body.includes("abc"), false);
  });

  it("validates subscription payloads", () => {
    assert.equal(validatePushSubscriptionPayload(null).ok, false);
    assert.equal(
      validatePushSubscriptionPayload({
        endpoint: "https://fcm.googleapis.com/fcm/send/x",
        keys: { p256dh: "p", auth: "a" },
      }).ok,
      true,
    );
    assert.equal(
      validatePushSubscriptionPayload({
        endpoint: "http://insecure",
        keys: { p256dh: "p", auth: "a" },
      }).ok,
      false,
    );
  });
});
