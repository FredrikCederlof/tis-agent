/** Shared Chats presentation helpers (INS-20). */

export const OUTCOME_LABELS: Record<string, string> = {
  success: "Answered",
  no_evidence: "AI couldn’t answer",
  low_confidence: "Low confidence",
  fixed_answer: "Fixed answer",
  error: "Error",
};

export type OutcomeTone = "success" | "warning" | "danger" | "neutral" | "info";

export function outcomeTone(outcome: string | null | undefined): OutcomeTone {
  switch (outcome) {
    case "success":
      return "success";
    case "low_confidence":
      return "warning";
    case "no_evidence":
    case "error":
      return "danger";
    case "fixed_answer":
      return "info";
    default:
      return "neutral";
  }
}

export function outcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return "Unknown";
  return OUTCOME_LABELS[outcome] || outcome;
}

/** First name from email local-part, else Admin. */
export function adminDisplayName(sentBy: string | null | undefined): string {
  const raw = (sentBy || "").trim();
  if (!raw) return "Admin";
  const local = raw.includes("@") ? raw.split("@")[0] || "" : raw;
  const token = local.split(/[._+\-]/)[0] || local;
  if (!token) return "Admin";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

const SOURCE_LINE =
  /^(?:[_*]?\s*)?(?:Source|Källa)\s*:\s*(.+?)\s*(?:[_*]?\s*)$/i;

export type Citation = {
  title: string;
  quote: string | null;
};

/** Parse a trailing WhatsApp citation line into title + optional quote. */
export function parseCitationLine(line: string): Citation | null {
  const trimmed = (line || "").trim().replace(/^[_*]+|[_*]+$/g, "").trim();
  const match = trimmed.match(SOURCE_LINE);
  if (!match) return null;
  const body = match[1].replace(/^[_*]+|[_*]+$/g, "").trim();
  if (!body || /^(none found\.?|ingen träff\.?)$/i.test(body)) return null;
  const dash = body.match(/^(.*?)\s+[—–-]\s+["“](.+?)["”]\s*$/);
  if (dash) {
    return { title: dash[1].trim(), quote: dash[2].trim() };
  }
  return { title: body, quote: null };
}

/** Strip trailing Source / Källa citation lines from a Tina reply body. */
export function stripSourceLines(text: string): { body: string; citations: Citation[] } {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const citations: Citation[] = [];
  while (lines.length) {
    const last = lines[lines.length - 1];
    if (!last.trim()) {
      lines.pop();
      continue;
    }
    const citation = parseCitationLine(last);
    if (!citation) break;
    citations.unshift(citation);
    lines.pop();
  }
  return { body: lines.join("\n").trimEnd(), citations };
}

/** Prefer stored document_titles; fall back to parsed citation titles. */
export function sourceTitles(
  documentTitles: string[] | null | undefined,
  replyText: string | null | undefined,
): { titles: string[]; quote: string | null } {
  const fromDb = (documentTitles || []).map((t) => t.trim()).filter(Boolean);
  const { citations } = stripSourceLines(replyText || "");
  const quote = citations.find((c) => c.quote)?.quote || null;
  if (fromDb.length) return { titles: [...new Set(fromDb)], quote };
  const fromText = citations.map((c) => c.title).filter(Boolean);
  return { titles: [...new Set(fromText)], quote };
}

/** Lightweight gate: skip empty / ultra-short greetings for Knowledge Hub CTA. */
export function isKnowledgeCandidateQuestion(text: string): boolean {
  const question = (text || "").trim();
  if (question.length < 8) return false;
  if (
    /^(hi|hello|hey|thanks|thank you|tack|ok|okay|bye|cheers)[\s!.?]*$/i.test(question)
  ) {
    return false;
  }
  return true;
}

export function knowledgeHubUrl(
  interactionId: string,
  options?: { answer?: string | null },
): string {
  const params = new URLSearchParams({ from: interactionId });
  const answer = (options?.answer || "").trim();
  if (answer) params.set("answer", answer);
  return `/knowledge/new?${params.toString()}`;
}
