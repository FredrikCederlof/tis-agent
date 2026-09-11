/** Time saved KPI: Tina successes × configured minutes per question. */

export const DEFAULT_MINUTES_SAVED_PER_QUESTION = 5;
export const MIN_MINUTES_SAVED_PER_QUESTION = 1;
export const MAX_MINUTES_SAVED_PER_QUESTION = 180;

export const TIME_SAVED_DEFINITION =
  "Estimated time saved based on questions successfully handled by Tina multiplied by the configured manual handling time per question.";

/** Grounded Tina answers (`interactions.outcome = success`) with no human reply. */
export function isTinaHandled(
  outcome: string,
  humanRepliedAt?: string | null,
): boolean {
  return outcome === "success" && !humanRepliedAt;
}

export function clampMinutesPerQuestion(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MINUTES_SAVED_PER_QUESTION;
  return Math.min(
    MAX_MINUTES_SAVED_PER_QUESTION,
    Math.max(MIN_MINUTES_SAVED_PER_QUESTION, Math.round(n)),
  );
}

export function formatSavedTime(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function timeSavedMinutes(
  handledCount: number,
  minutesPerQuestion: number,
): number {
  return Math.max(0, Math.round(handledCount)) * clampMinutesPerQuestion(minutesPerQuestion);
}

export function formatSavedTimeDelta(
  currentMinutes: number,
  previousMinutes: number,
): string | null {
  const current = Math.max(0, Math.round(currentMinutes));
  const previous = Math.max(0, Math.round(previousMinutes));
  if (previous === 0) {
    if (current === 0) return "→ 0m";
    return `↑ ${formatSavedTime(current)}`;
  }
  const diff = current - previous;
  if (diff === 0) return "→ 0m";
  const arrow = diff > 0 ? "↑" : "↓";
  return `${arrow} ${formatSavedTime(Math.abs(diff))}`;
}
