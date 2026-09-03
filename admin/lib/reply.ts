// Reply-window display — enforcement lives in tis_agent/human_reply.py.
// Meta allows free-form text for 24h after the parent's last WhatsApp message.

export const REPLY_WINDOW_HOURS = 24;

export type ReplyWindow = {
  open: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number;
  label: string;
};

export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "Reply window expired";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 1) return `Reply window open — ${hours}h remaining`;
  if (minutes >= 1) return `Reply window open — ${minutes}m remaining`;
  return "Reply window open — under a minute remaining";
}

export function replyWindow(
  lastInboundAt: string | null | undefined,
  now: Date = new Date(),
): ReplyWindow {
  if (!lastInboundAt) {
    return {
      open: false,
      lastInboundAt: null,
      expiresAt: null,
      remainingSeconds: 0,
      label: "No inbound message — reply window unknown",
    };
  }
  const expires = new Date(new Date(lastInboundAt).getTime() + REPLY_WINDOW_HOURS * 3600 * 1000);
  const remaining = Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000));
  return {
    open: remaining > 0,
    lastInboundAt,
    expiresAt: expires.toISOString(),
    remainingSeconds: remaining,
    label: formatRemaining(remaining),
  };
}

export const DRAFT_KEY_PREFIX = "tis-admin-reply-draft:";

export function draftKey(interactionId: string): string {
  return `${DRAFT_KEY_PREFIX}${interactionId}`;
}

export function loadDraft(interactionId: string): string {
  if (typeof window === "undefined" || !interactionId) return "";
  return window.localStorage.getItem(draftKey(interactionId)) || "";
}

export function saveDraft(interactionId: string, body: string): void {
  if (typeof window === "undefined" || !interactionId) return;
  if (body.trim()) {
    window.localStorage.setItem(draftKey(interactionId), body);
  } else {
    window.localStorage.removeItem(draftKey(interactionId));
  }
}

export function clearDraft(interactionId: string): void {
  if (typeof window === "undefined" || !interactionId) return;
  window.localStorage.removeItem(draftKey(interactionId));
}
