/** Staff Sandbox presentation helpers (not WhatsApp analytics). */

export type SandboxConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type SandboxMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  outcome: string | null;
  document_titles: string[] | null;
  created_at: string;
};

export type SandboxMonthFolder = {
  key: string;
  label: string;
  conversations: SandboxConversation[];
};

const TOKYO = "Asia/Tokyo";

export function titleFromQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

function tokyoParts(iso: string): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date(iso));
  const y = Number(parts.find((p) => p.type === "year")?.value || 0);
  const m = Number(parts.find((p) => p.type === "month")?.value || 0);
  return { y, m };
}

export function monthKeyFromIso(iso: string): string {
  const { y, m } = tokyoParts(iso);
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function monthLabelFromKey(key: string): string {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m) return key;
  // Noon UTC avoids month boundary drift when formatting a civil month.
  const d = new Date(Date.UTC(y, m - 1, 15, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    month: "long",
    year: "numeric",
  }).format(d);
}

export function currentTokyoMonthKey(now = new Date()): string {
  return monthKeyFromIso(now.toISOString());
}

/** Group conversations into month folders (newest month first). */
export function groupConversationsByMonth(
  conversations: SandboxConversation[],
): SandboxMonthFolder[] {
  const map = new Map<string, SandboxConversation[]>();
  for (const row of conversations) {
    const key = monthKeyFromIso(row.updated_at || row.created_at);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, rows]) => ({
      key,
      label: monthLabelFromKey(key),
      conversations: rows.sort((a, b) =>
        (a.updated_at || a.created_at) < (b.updated_at || b.created_at) ? 1 : -1,
      ),
    }));
}
