/** Tokyo-calendar analytics for the admin dashboard. Japan has no DST. */

export const TOKYO = "Asia/Tokyo";
export const DEFAULT_RANGE_DAYS = 30;

export function tokyoYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function tokyoDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

export function tokyoDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+09:00`);
}

export function shiftYmd(ymd: string, days: number): string {
  const d = tokyoDayStart(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return tokyoYmd(d);
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
  // Cap extreme ranges so the chart stays usable.
  const maxDays = 366;
  if (daysInclusive(from, to) > maxDays) {
    from = shiftYmd(to, -(maxDays - 1));
  }
  return { from, to };
}

export type DailyPoint = {
  key: string;
  label: string;
  sessions: number;
  questions: number;
  gaps: number;
  success: number;
};

export type PeriodStats = {
  sessions: number;
  questions: number;
  avgQuestionsPerSession: number | null;
  successCount: number;
  gapCount: number;
  fixedCount: number;
  errorCount: number;
  successRate: number;
};

export type SessionRow = {
  id: string;
  started_at: string;
};

export type InteractionRow = {
  created_at: string;
  outcome: string;
};

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Earliest ISO to fetch so current + previous comparison windows are covered. */
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

function successRate(success: number, gaps: number): number {
  const total = success + gaps;
  return total > 0 ? Math.round((success / total) * 100) : 0;
}

function statsFor(sessions: SessionRow[], interactions: InteractionRow[]): PeriodStats {
  const successCount = interactions.filter((i) => i.outcome === "success").length;
  const gapCount = interactions.filter(
    (i) => i.outcome === "no_evidence" || i.outcome === "low_confidence",
  ).length;
  const sessionCount = sessions.length;
  const questions = interactions.length;
  return {
    sessions: sessionCount,
    questions,
    avgQuestionsPerSession:
      sessionCount > 0 ? Math.round((questions / sessionCount) * 100) / 100 : null,
    successCount,
    gapCount,
    fixedCount: interactions.filter((i) => i.outcome === "fixed_answer").length,
    errorCount: interactions.filter((i) => i.outcome === "error").length,
    successRate: successRate(successCount, gapCount),
  };
}

export function buildDashboardModel(
  sessions: SessionRow[],
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
      sessions: 0,
      questions: 0,
      gaps: 0,
      success: 0,
    });
  }
  const byDay = Object.fromEntries(days.map((d) => [d.key, d]));

  const currentSessions = sessions.filter((s) => inYmdRange(s.started_at, fromYmd, toYmd));
  const previousSessions = sessions.filter((s) =>
    inYmdRange(s.started_at, previousStart, previousEnd),
  );
  const currentIx = interactions.filter((i) => inYmdRange(i.created_at, fromYmd, toYmd));
  const previousIx = interactions.filter((i) =>
    inYmdRange(i.created_at, previousStart, previousEnd),
  );

  for (const session of currentSessions) {
    const key = tokyoYmd(new Date(session.started_at));
    if (byDay[key]) byDay[key].sessions += 1;
  }
  for (const item of currentIx) {
    const key = tokyoYmd(new Date(item.created_at));
    if (!byDay[key]) continue;
    byDay[key].questions += 1;
    if (item.outcome === "success") byDay[key].success += 1;
    if (item.outcome === "no_evidence" || item.outcome === "low_confidence") {
      byDay[key].gaps += 1;
    }
  }

  return {
    from: fromYmd,
    to: toYmd,
    rangeLabel: formatRangeLabel(fromYmd, toYmd),
    dayCount: length,
    previousLabel: formatRangeLabel(previousStart, previousEnd),
    current: statsFor(currentSessions, currentIx),
    previous: statsFor(previousSessions, previousIx),
    days,
  };
}

export const KPI_DEFINITIONS = {
  sessions:
    "Unique parent WhatsApp conversations started in this period. A new session begins after 10 minutes of silence.",
  questions: "Parent messages Tina received during this period.",
  avg: "Questions divided by sessions in this period. Higher means parents asked more follow-ups per conversation.",
  success:
    "Share of questions Tina handled from official TIS sources (Handled by Tina). Grounded answers ÷ (grounded answers + knowledge gaps). Fixed answers and errors are counted separately in Outcome mix.",
} as const;
