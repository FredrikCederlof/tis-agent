// Knowledge Hub question candidates — keep in sync with tis_agent/conversation.py.
// Reuses the greeting / ack / nudge classifiers so Admin and WhatsApp stay aligned.

const GREETING_RE =
  /^\s*(?:hi|hii+|hello|hey|yo|good\s+(?:morning|afternoon|evening)|hej|tjena|hallå|hola|thanks|thank\s+you|thank\s+u|tack|ok|okay|okey|cheers|bye|goodbye|great|awesome|cool|nice|perfect|got\s+it|sounds?\s+good|all\s+good|understood|noted|👍|🙏)[\s!.?]*$/i;

const CONFIRM_RE =
  /^\s*(?:are\s+you\s+sure|are\s+u\s+sure|sure\?|really\?|confirm(?:\s+that)?|check\s+(?:again|the\s+calendar|calendar)|double[- ]?check|är\s+du\s+säker|kolla\s+(?:igen|kalendern))[\s!.?]*$/i;

const PORTAL_NUDGE_RE =
  /^\s*(?:yes\s+in\s+tis\s+portal|in\s+the\s+(?:tis\s+)?portal|check\s+(?:the\s+)?(?:calendar|portal)|look\s+(?:in|at)\s+(?:the\s+)?calendar)[\s!.?]*$/i;

export type KnowledgeCandidate = {
  id: string;
  question: string;
  reply: string | null;
  created_at: string;
  outcome?: string | null;
};

export function isGreetingOrThanks(text: string): boolean {
  return GREETING_RE.test((text || "").trim());
}

export function isConfirmationChallenge(text: string): boolean {
  return CONFIRM_RE.test((text || "").trim());
}

export function isCalendarPortalNudge(text: string): boolean {
  return PORTAL_NUDGE_RE.test((text || "").trim());
}

/** True when a parent message is worth turning into a Knowledge Hub entry. */
export function isKnowledgeCandidateQuestion(text: string): boolean {
  const question = (text || "").trim();
  if (!question) return false;
  if (isGreetingOrThanks(question)) return false;
  if (isConfirmationChallenge(question)) return false;
  if (isCalendarPortalNudge(question)) return false;
  return true;
}

/** Parent interactions that can seed a Knowledge Hub entry (oldest first). */
export function knowledgeCandidates<
  T extends { id: string; question: string; reply?: string | null; created_at: string },
>(interactions: T[]): T[] {
  return [...interactions]
    .filter((item) => isKnowledgeCandidateQuestion(item.question))
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
}

/** Open the existing Knowledge Hub create form for one interaction. */
export function knowledgeHubUrl(
  interactionId: string,
  options?: { answer?: string | null },
): string {
  const params = new URLSearchParams({ from: interactionId });
  const answer = (options?.answer || "").trim();
  if (answer) params.set("answer", answer);
  return `/knowledge/new?${params.toString()}`;
}
