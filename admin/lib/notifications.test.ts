import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOTIFY_BODY_GENERIC,
  NOTIFY_CHOICE_KEY,
  NOTIFY_TITLE,
  chatSessionPath,
  deliveryIdempotencyKey,
  isNeedsAttentionUnanswered,
  notificationPayloadForInteraction,
  previewQuestion,
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

describe("preview and payload", () => {
  it("builds a stable user+message key", () => {
    assert.equal(deliveryIdempotencyKey("u1", "i1"), "u1:i1");
  });

  it("shortens long questions and strips newlines", () => {
    assert.equal(previewQuestion("When does term start?"), "When does term start?");
    assert.equal(previewQuestion("Line one\n\nLine two"), "Line one Line two");
    const long = "A".repeat(120);
    const preview = previewQuestion(long, 100);
    assert.ok(preview);
    assert.equal(preview!.endsWith("…"), true);
    assert.ok(preview!.length <= 100);
  });

  it("uses generic body when previews are off", () => {
    const payload = notificationPayloadForInteraction({
      interactionId: "abc",
      sessionId: "sess-1",
      question: "Secret question content",
      showPreview: false,
    });
    assert.equal(payload.title, NOTIFY_TITLE);
    assert.equal(payload.body, NOTIFY_BODY_GENERIC);
    assert.equal(payload.data.url, "/chats/sess-1");
    assert.equal(payload.body.includes("Secret"), false);
    assert.equal(payload.body.includes("abc"), false);
  });

  it("includes a preview when enabled and falls back safely", () => {
    const withPreview = notificationPayloadForInteraction({
      interactionId: "abc",
      sessionId: "sess-1",
      question: "When does the autumn term start?",
      showPreview: true,
    });
    assert.equal(withPreview.title, NOTIFY_TITLE);
    assert.equal(withPreview.body, "When does the autumn term start?");
    assert.equal(withPreview.data.interactionId, "abc");

    const empty = notificationPayloadForInteraction({
      interactionId: "abc",
      question: "   ",
      showPreview: true,
    });
    assert.equal(empty.body, NOTIFY_BODY_GENERIC);
    assert.equal(empty.data.url, "/inbox");
    assert.equal(chatSessionPath(null), "/inbox");
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
