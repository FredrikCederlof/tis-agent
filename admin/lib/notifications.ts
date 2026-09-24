/** Browser notification prefs for Needs attention (client-only). */

export const NOTIFY_CHOICE_KEY = "tis-admin-notify-choice";
export const NOTIFY_SEEN_KEY = "tis-admin-notify-seen-ids";
export const NOTIFY_SEEN_MAX = 200;
export const NEEDS_ATTENTION_INBOX_PATH = "/inbox";

export type NotifyChoice = "enabled" | "dismissed";

export type AttentionItem = {
  id: string;
  created_at?: string | null;
  manual_attention_at?: string | null;
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

export function readSeenIds(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
): string[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(NOTIFY_SEEN_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function writeSeenIds(
  ids: string[],
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
): void {
  const trimmed = ids.slice(-NOTIFY_SEEN_MAX);
  storage?.setItem(NOTIFY_SEEN_KEY, JSON.stringify(trimmed));
}

/** First poll after opt-in: remember current queue so backlog does not spam. */
export function seedSeenIds(currentIds: string[], previousSeen: string[]): string[] {
  const merged = [...previousSeen];
  for (const id of currentIds) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged.slice(-NOTIFY_SEEN_MAX);
}

/**
 * IDs that should notify now: in the current Needs attention queue, not yet seen.
 * Also prune seen IDs that left the queue so a later re-flag can notify again.
 */
export function diffAttentionNotifications(
  currentIds: string[],
  previousSeen: string[],
): { notifyIds: string[]; nextSeen: string[] } {
  const current = new Set(currentIds);
  const pruned = previousSeen.filter((id) => current.has(id));
  const prunedSet = new Set(pruned);
  const notifyIds = currentIds.filter((id) => !prunedSet.has(id));
  const nextSeen = [...pruned, ...notifyIds].slice(-NOTIFY_SEEN_MAX);
  return { notifyIds, nextSeen };
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationBodyForCount(count: number): string {
  if (count <= 1) return "A parent message needs attention in Tina Admin.";
  return `${count} parent messages need attention in Tina Admin.`;
}
