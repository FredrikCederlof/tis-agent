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
  needs_attention: boolean;
  needs_attention_count: number;
  last_admin_reply: string | null;
  last_admin_reply_at: string | null;
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
  reviewed_at: string | null;
  human_replied_at: string | null;
  human_replied_by: string | null;
  manual_attention_at?: string | null;
  manual_attention_by?: string | null;
};

export type ParentHistoryStats = {
  totalQuestions: number;
  totalSessions: number;
  uniqueQuestions: number;
  firstSeen: string | null;
  lastSeen: string | null;
  answeredFromKnowledge: number;
  aiCouldNotAnswer: number;
  humanReplies: number;
  addedToKnowledgeHub: number;
};

export function emptyParentHistoryStats(): ParentHistoryStats {
  return {
    totalQuestions: 0,
    totalSessions: 0,
    uniqueQuestions: 0,
    firstSeen: null,
    lastSeen: null,
    answeredFromKnowledge: 0,
    aiCouldNotAnswer: 0,
    humanReplies: 0,
    addedToKnowledgeHub: 0,
  };
}

/** Aggregate parent-wide Chats / AI outcome stats from raw rows. */
export function buildParentHistoryStats(input: {
  sessions: { started_at: string; last_message_at: string }[];
  interactions: { question: string; outcome: string }[];
  humanReplyCount: number;
  knowledgeHubCount: number;
}): ParentHistoryStats {
  const { sessions, interactions, humanReplyCount, knowledgeHubCount } = input;
  const unique = new Set(
    interactions
      .map((row) => (row.question || "").trim().toLowerCase())
      .filter(Boolean),
  );
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;
  for (const session of sessions) {
    if (!firstSeen || session.started_at < firstSeen) firstSeen = session.started_at;
    if (!lastSeen || session.last_message_at > lastSeen) lastSeen = session.last_message_at;
  }
  return {
    totalQuestions: interactions.length,
    totalSessions: sessions.length,
    uniqueQuestions: unique.size,
    firstSeen,
    lastSeen,
    answeredFromKnowledge: interactions.filter(
      (row) => row.outcome === "success" || row.outcome === "fixed_answer",
    ).length,
    aiCouldNotAnswer: interactions.filter((row) =>
      GAP_OUTCOMES.includes(row.outcome as (typeof GAP_OUTCOMES)[number]),
    ).length,
    humanReplies: humanReplyCount,
    addedToKnowledgeHub: knowledgeHubCount,
  };
}

export type AdminReply = {
  id: string;
  session_id: string;
  interaction_id: string | null;
  wa_from: string;
  wa_message_id: string | null;
  body: string;
  status: "sent" | "failed";
  error: string | null;
  sent_by: string | null;
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

export type ChatMessage = {
  id: string;
  kind: "parent" | "tina" | "admin";
  text: string;
  at: string;
  interactionId: string | null;
  outcome?: string | null;
  needsAttention: boolean;
  status?: "sent" | "failed";
  sentBy?: string | null;
};

export function needsAttention(row: {
  outcome?: string | null;
  reviewed_at?: string | null;
  manual_attention_at?: string | null;
}): boolean {
  if (row.reviewed_at) return false;
  if (row.manual_attention_at) return true;
  return GAP_OUTCOMES.includes((row.outcome || "") as (typeof GAP_OUTCOMES)[number]);
}

/** Merge parent questions, Tina answers, and admin replies into one thread. */
export function buildTimeline(
  interactions: ChatInteraction[],
  adminReplies: AdminReply[] = [],
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const item of interactions) {
    messages.push({
      id: `${item.id}:parent`,
      kind: "parent",
      text: item.question || "",
      at: item.created_at,
      interactionId: item.id,
      outcome: item.outcome,
      needsAttention: needsAttention(item),
    });
    if (item.reply) {
      messages.push({
        id: `${item.id}:tina`,
        kind: "tina",
        text: item.reply,
        at: item.created_at,
        interactionId: item.id,
        outcome: item.outcome,
        needsAttention: false,
      });
    }
  }
  for (const reply of adminReplies) {
    messages.push({
      id: `${reply.id}:admin`,
      kind: "admin",
      text: reply.body || "",
      at: reply.created_at,
      interactionId: reply.interaction_id,
      needsAttention: false,
      status: reply.status,
      sentBy: reply.sent_by,
    });
  }
  const rank = { parent: 0, tina: 1, admin: 2 };
  return messages.sort((a, b) =>
    a.at === b.at ? rank[a.kind] - rank[b.kind] : (a.at || "").localeCompare(b.at || ""),
  );
}

/** Oldest question still needing attention, else the most recent question. */
export function replyTarget(interactions: ChatInteraction[]): ChatInteraction | null {
  const pending = interactions.filter((item) => needsAttention(item));
  const pool = pending.length ? pending : interactions;
  if (!pool.length) return null;
  if (pending.length) {
    return pool.reduce((oldest, item) => (item.created_at < oldest.created_at ? item : oldest));
  }
  return pool.reduce((newest, item) => (item.created_at > newest.created_at ? item : newest));
}

export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export type SessionFilters = {
  query: string;
  read: "" | "unread" | "read" | "attention";
  language: string;
  outcome: string;
  from: string;
  to: string;
};

export function filterSessions(
  rows: ChatSessionRow[],
  { query, read, language, outcome, from, to }: SessionFilters,
): ChatSessionRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (read === "unread" && !row.unread) return false;
    if (read === "read" && row.unread) return false;
    if (read === "attention" && !row.needs_attention) return false;
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
