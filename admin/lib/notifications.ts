/** Shared push notification helpers (client + server safe pure functions). */

export const NOTIFY_CHOICE_KEY = "tis-admin-notify-choice";
export const NEEDS_ATTENTION_INBOX_PATH = "/inbox";
export const PUSH_SW_PATH = "/sw.js";
export const GAP_OUTCOMES = ["no_evidence", "low_confidence"] as const;
export const NOTIFY_TITLE = "New message needs attention";
export const NOTIFY_BODY_GENERIC = "Open Tina Admin to review and reply.";
export const NOTIFY_PREVIEW_MAX_CHARS = 100;

export type NotifyChoice = "enabled" | "dismissed";
export type NotifyUiState =
  | "unsupported"
  | "prompt"
  | "enabled"
  | "blocked"
  | "not_enabled";

export type PushSubscriptionJSON = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  expirationTime?: number | null;
};

export function readNotifyChoice(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
): NotifyChoice | null {
  if (!storage) return null;
  const raw = storage.getItem(NOTIFY_CHOICE_KEY);
  if (raw === "enabled" || raw === "dismissed") return raw;
  return null;
}

export function writeNotifyChoice(
  choice: NotifyChoice,
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
): void {
  storage?.setItem(NOTIFY_CHOICE_KEY, choice);
}

export function notificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function resolveNotifyUiState(args: {
  supported: boolean;
  choice: NotifyChoice | null;
  permission: NotificationPermission | "default" | "granted" | "denied" | null;
}): NotifyUiState {
  if (!args.supported) return "unsupported";
  if (args.permission === "denied") return "blocked";
  if (args.choice === "enabled" && args.permission === "granted") return "enabled";
  if (args.choice === null) return "prompt";
  return "not_enabled";
}

export function deliveryIdempotencyKey(userId: string, interactionId: string): string {
  return `${userId}:${interactionId}`;
}

export type NeedsAttentionRow = {
  id: string;
  reviewed_at?: string | null;
  human_replied_at?: string | null;
  manual_attention_at?: string | null;
  outcome?: string | null;
  session_id?: string | null;
  question?: string | null;
};

/** True when the row currently belongs in Needs attention (unanswered). */
export function isNeedsAttentionUnanswered(row: NeedsAttentionRow | null | undefined): boolean {
  if (!row?.id) return false;
  if (row.reviewed_at) return false;
  if (row.human_replied_at) return false;
  if (row.manual_attention_at) return true;
  return GAP_OUTCOMES.includes(row.outcome as (typeof GAP_OUTCOMES)[number]);
}

/** Collapse whitespace/newlines and shorten for lock-screen-safe previews. */
export function previewQuestion(
  question: string | null | undefined,
  maxChars: number = NOTIFY_PREVIEW_MAX_CHARS,
): string | null {
  const cleaned = (question || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= maxChars) return cleaned;
  const slice = cleaned.slice(0, Math.max(1, maxChars - 1)).trimEnd();
  return `${slice}…`;
}

export function chatSessionPath(sessionId: string | null | undefined): string {
  const id = (sessionId || "").trim();
  if (!id) return NEEDS_ATTENTION_INBOX_PATH;
  return `/chats/${encodeURIComponent(id)}`;
}

export function notificationPayloadForInteraction(args: {
  interactionId: string;
  sessionId?: string | null;
  question?: string | null;
  showPreview?: boolean;
}): {
  title: string;
  body: string;
  tag: string;
  data: { url: string; interactionId: string; sessionId?: string };
} {
  const interactionId = args.interactionId;
  const sessionId = (args.sessionId || "").trim() || undefined;
  const url = chatSessionPath(sessionId);

  let body = NOTIFY_BODY_GENERIC;
  if (args.showPreview) {
    const preview = previewQuestion(args.question);
    if (preview) body = preview;
  }

  return {
    title: NOTIFY_TITLE,
    body,
    tag: `needs-attention-${interactionId}`,
    data: {
      url,
      interactionId,
      ...(sessionId ? { sessionId } : {}),
    },
  };
}

export function validatePushSubscriptionPayload(
  body: unknown,
): { ok: true; endpoint: string; p256dh: string; auth: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const record = body as Record<string, unknown>;
  const endpoint = typeof record.endpoint === "string" ? record.endpoint.trim() : "";
  const keys = (record.keys || {}) as Record<string, unknown>;
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!endpoint.startsWith("https://")) return { ok: false, error: "Invalid endpoint" };
  if (!p256dh || !auth) return { ok: false, error: "Missing subscription keys" };
  if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) {
    return { ok: false, error: "Subscription fields too long" };
  }
  return { ok: true, endpoint, p256dh, auth };
}

/** urlBase64 → Uint8Array for PushManager.subscribe applicationServerKey */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
