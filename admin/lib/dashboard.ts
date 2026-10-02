import { isTinaHandled, TIME_SAVED_DEFINITION } from "./time-saved";
import {
  TOKYO,
  buildWeeklySeries,
  formatWeekLabel,
  shiftYmd,
  tokyoDayStart,
  tokyoYmd,
  weekStartYmd,
  type WeeklyPoint,
} from "./tokyo-weeks";

export {
  TOKYO,
  buildWeeklySeries,
  formatWeekLabel,
  shiftYmd,
  tokyoDayStart,
  tokyoYmd,
  weekStartYmd,
};
export type { WeeklyPoint };

/** Tokyo-calendar analytics for the admin dashboard. Japan has no DST. */

export const DEFAULT_RANGE_DAYS = 30;

export function tokyoDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+09:00`);
}

/** Inclusive day count between two YMD dates (same day => 1). */
export function daysInclusive(startYmd: string, endYmd: string): number {
  const start = tokyoDayStart(startYmd).getTime();
  const end = tokyoDayStart(endYmd).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function formatDayLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    month: "short",
    day: "numeric",
  }).format(tokyoDayStart(ymd));
}

/** Compact chart axis label, e.g. "Mon 22". */
export function formatChartDayLabel(ymd: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    weekday: "short",
    day: "numeric",
  }).formatToParts(tokyoDayStart(ymd));
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  return `${weekday} ${day}`.trim();
}

export function formatRangeLabel(startYmd: string, endYmd: string): string {
  const start = tokyoDayStart(startYmd);
  const end = tokyoDayStart(endYmd);
  const left = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    month: "short",
    day: "numeric",
  }).format(start);
  const right = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end);
  return `${left} – ${right}`;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: string | null | undefined): value is string {
  if (!value || !YMD_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = tokyoDayStart(value);
  return (
    !Number.isNaN(dt.getTime()) &&
    tokyoYmd(dt) === value &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= 31
  );
}

/** Default: last 30 Tokyo calendar days including today. */
export function defaultDateRange(now = new Date()): { from: string; to: string } {
  const to = tokyoYmd(now);
  return { from: shiftYmd(to, -(DEFAULT_RANGE_DAYS - 1)), to };
}

export function resolveDateRange(
  fromParam?: string | null,
  toParam?: string | null,
  now = new Date(),
): { from: string; to: string } {
  const fallback = defaultDateRange(now);
  let from = isYmd(fromParam) ? fromParam : fallback.from;
  let to = isYmd(toParam) ? toParam : fallback.to;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  const maxDays = 366;
  if (daysInclusive(from, to) > maxDays) {
    from = shiftYmd(to, -(maxDays - 1));
  }
  return { from, to };
}

export type DailyPoint = {
  key: string;
  label: string;
  questions: number;
  gaps: number;
  success: number;
  tinaHandled: number;
  answeredPct: number;
  attentionPct: number;
};

export type PeriodStats = {
  questions: number;
  successCount: number;
  gapCount: number;
  fixedCount: number;
  errorCount: number;
  /** Grounded ÷ (grounded + gaps). */
  answeredByTinaPct: number;
  /** (grounded + fixed) ÷ all questions in period. */
  knowledgeCoveragePct: number;
  humanReplyCount: number;
  /** Grounded Tina answers with no human reply. */
  tinaHandledCount: number;
};

export type InteractionRow = {
  created_at: string;
  outcome: string;
  question?: string | null;
  human_replied_at?: string | null;
};

export type KnowledgeGap = {
  topic: string;
  count: number;
};

export type TopQuestion = {
  topic: string;
  count: number;
};

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function percentagePointChange(current: number, previous: number): number | null {
  if (Number.isNaN(current) || Number.isNaN(previous)) return null;
  return Math.round(current - previous);
}

export function fetchSinceIso(fromYmd: string, toYmd: string): string {
  const length = daysInclusive(fromYmd, toYmd);
  const previousStart = shiftYmd(fromYmd, -length);
  return tokyoDayStart(previousStart).toISOString();
}

export function fetchUntilIso(toYmd: string): string {
  return tokyoDayEnd(toYmd).toISOString();
}

function inYmdRange(iso: string, start: string, end: string): boolean {
  const key = tokyoYmd(new Date(iso));
  return key >= start && key <= end;
}

function isGap(outcome: string): boolean {
  return outcome === "no_evidence" || outcome === "low_confidence";
}

function answeredByTinaPct(success: number, gaps: number): number {
  const total = success + gaps;
  return total > 0 ? Math.round((success / total) * 100) : 0;
}

function knowledgeCoveragePct(success: number, fixed: number, questions: number): number {
  return questions > 0 ? Math.round(((success + fixed) / questions) * 100) : 0;
}

function statsFor(interactions: InteractionRow[]): PeriodStats {
  const successCount = interactions.filter((i) => i.outcome === "success").length;
  const gapCount = interactions.filter((i) => isGap(i.outcome)).length;
  const fixedCount = interactions.filter((i) => i.outcome === "fixed_answer").length;
  const errorCount = interactions.filter((i) => i.outcome === "error").length;
  const humanReplyCount = interactions.filter((i) => Boolean(i.human_replied_at)).length;
  const tinaHandledCount = interactions.filter((i) =>
    isTinaHandled(i.outcome, i.human_replied_at),
  ).length;
  const questions = interactions.length;
  return {
    questions,
    successCount,
    gapCount,
    fixedCount,
    errorCount,
    answeredByTinaPct: answeredByTinaPct(successCount, gapCount),
    knowledgeCoveragePct: knowledgeCoveragePct(successCount, fixedCount, questions),
    humanReplyCount,
    tinaHandledCount,
  };
}

function rankQuestions(
  interactions: InteractionRow[],
  limit: number,
  predicate: (row: InteractionRow) => boolean,
): TopQuestion[] {
  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  for (const row of interactions) {
    if (!predicate(row)) continue;
    const raw = (row.question || "").trim();
    if (!raw) continue;
    const topic = raw.replace(/\s+/g, " ").slice(0, 72);
    const key = topic.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!samples.has(key)) samples.set(key, topic);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ topic: samples.get(key) || key, count }));
}

/** Normalize gap questions into crude topic keys for ranking. */
export function rankKnowledgeGaps(
  interactions: InteractionRow[],
  limit = 5,
): KnowledgeGap[] {
  return rankQuestions(interactions, limit, (row) => isGap(row.outcome));
}

/** Most common parent questions in the period (any outcome). */
export function rankTopQuestions(
  interactions: InteractionRow[],
  limit = 5,
): TopQuestion[] {
  return rankQuestions(interactions, limit, () => true);
}

export function buildDashboardModel(
  interactions: InteractionRow[],
  fromYmd: string,
  toYmd: string,
) {
  const length = daysInclusive(fromYmd, toYmd);
  const previousEnd = shiftYmd(fromYmd, -1);
  const previousStart = shiftYmd(fromYmd, -length);

  const days: DailyPoint[] = [];
  for (let i = 0; i < length; i++) {
    const key = shiftYmd(fromYmd, i);
    days.push({
      key,
      label: formatDayLabel(key),
      questions: 0,
      gaps: 0,
      success: 0,
      tinaHandled: 0,
      answeredPct: 0,
      attentionPct: 0,
    });
  }
  const byDay = Object.fromEntries(days.map((d) => [d.key, d]));

  const currentIx = interactions.filter((i) => inYmdRange(i.created_at, fromYmd, toYmd));
  const previousIx = interactions.filter((i) =>
    inYmdRange(i.created_at, previousStart, previousEnd),
  );

  for (const item of currentIx) {
    const key = tokyoYmd(new Date(item.created_at));
    if (!byDay[key]) continue;
    byDay[key].questions += 1;
    if (item.outcome === "success") byDay[key].success += 1;
    if (isTinaHandled(item.outcome, item.human_replied_at)) byDay[key].tinaHandled += 1;
    if (isGap(item.outcome)) byDay[key].gaps += 1;
  }

  for (const day of days) {
    const denom = day.success + day.gaps;
    day.answeredPct = denom > 0 ? Math.round((day.success / denom) * 100) : 0;
    day.attentionPct =
      day.questions > 0 ? Math.round((day.gaps / day.questions) * 100) : 0;
  }

  const weeks = buildWeeklySeries(days);

  return {
    from: fromYmd,
    to: toYmd,
    rangeLabel: formatRangeLabel(fromYmd, toYmd),
    dayCount: length,
    previousLabel: formatRangeLabel(previousStart, previousEnd),
    current: statsFor(currentIx),
    previous: statsFor(previousIx),
    days,
    weeks,
    topGaps: rankKnowledgeGaps(currentIx, 5),
    topQuestions: rankTopQuestions(currentIx, 5),
  };
}

export const KPI_DEFINITIONS = {
  totalQuestions: "Total parent questions Tina received during this period.",
  answeredByTina:
    "Share of questions Tina answered from official TIS sources. Grounded answers ÷ (grounded answers + knowledge gaps).",
  needsAttention:
    "Open items in Needs attention right now (auto gaps + manually flagged). Not limited to the date range.",
  knowledgeCoverage:
    "Share of period questions that received a grounded or fixed answer (excludes open gaps and system errors from the numerator).",
  timeSaved: TIME_SAVED_DEFINITION,
  knowledgeArticles: "Active Q&A entries in the Knowledge Hub that Tina can retrieve.",
  addedFromParents: "Knowledge Hub entries created from parent questions in Needs attention.",
  addedThisPeriod: "Knowledge Hub entries created during the current date range (last 30 days by default).",
} as const;

export function attentionReason(outcome: string): {
  label: string;
  tone: "amber" | "rose" | "blue" | "gray";
} {
  if (outcome === "low_confidence") return { label: "Needs review", tone: "amber" };
  if (outcome === "no_evidence") return { label: "Unanswered", tone: "rose" };
  if (outcome === "fixed_answer") return { label: "Follow up", tone: "blue" };
  return { label: "Clarify", tone: "gray" };
}
