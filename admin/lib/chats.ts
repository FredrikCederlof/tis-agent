import { PAGE_SIZE, pageCount, paginate } from "@/lib/knowledge-hub";

export { PAGE_SIZE, pageCount, paginate };

export const GAP_OUTCOMES = ["no_evidence", "low_confidence"] as const;

export type ChatSessionRow = {
  id: string;
  wa_from: string;
  started_at: string;
  last_message_at: string;
  message_count: number;
  primary_language: string | null;
  admin_read_at: string | null;
  unread: boolean;
  last_question: string | null;
  last_reply: string | null;
  last_outcome: string | null;
};

export type ChatInteraction = {
  id: string;
  session_id: string;
  wa_message_id: string | null;
  wa_from: string;
  question: string;
  reply: string | null;
  language: string;
  outcome: string;
  created_at: string;
};

export function isUnread(
  adminReadAt: string | null | undefined,
  lastMessageAt: string | null | undefined,
): boolean {
  if (!lastMessageAt) return !adminReadAt;
  if (!adminReadAt) return true;
  return lastMessageAt > adminReadAt;
}

export function parentLabel(waFrom: string | null | undefined): string {
  const digits = (waFrom || "").replace(/\D/g, "");
  if (digits.length >= 4) return `Parent ·••${digits.slice(-4)}`;
  if (digits) return `Parent ·••${digits}`;
  return "Parent";
}

export function parentHue(waFrom: string | null | undefined): number {
  const text = waFrom || "";
  let total = 0;
  for (let i = 0; i < text.length; i += 1) total += text.charCodeAt(i);
  return total % 360;
}

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function filterSessions(
  rows: ChatSessionRow[],
  {
    query,
    read,
    language,
    outcome,
    from,
    to,
  }: {
    query: string;
    read: "" | "unread" | "read";
    language: string;
    outcome: string;
    from: string;
    to: string;
  },
): ChatSessionRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (read === "unread" && !row.unread) return false;
    if (read === "read" && row.unread) return false;
    if (language && (row.primary_language || "") !== language) return false;
    if (outcome === "gap" && !GAP_OUTCOMES.includes((row.last_outcome || "") as (typeof GAP_OUTCOMES)[number])) {
      return false;
    }
    if (outcome && outcome !== "gap" && row.last_outcome !== outcome) return false;
    const day = (row.last_message_at || "").slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (!needle) return true;
    const haystack = [
      parentLabel(row.wa_from),
      row.last_question || "",
      row.last_reply || "",
      row.wa_from,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}
