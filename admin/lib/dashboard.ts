/** Tokyo-calendar analytics for the admin dashboard. Japan has no DST. */

export const TOKYO = "Asia/Tokyo";

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

export function shiftYmd(ymd: string, days: number): string {
  const d = tokyoDayStart(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return tokyoYmd(d);
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
}

export type InteractionRow = {
  created_at: string;
  outcome: string;
};

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function fetchSinceIso(now = new Date()): string {
  const today = tokyoYmd(now);
  const currentStart = shiftYmd(today, -6);
  return tokyoDayStart(shiftYmd(currentStart, -7)).toISOString();
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
  now = new Date(),
) {
  const today = tokyoYmd(now);
  const currentStart = shiftYmd(today, -6);
  const previousStart = shiftYmd(currentStart, -7);
  const previousEnd = shiftYmd(currentStart, -1);

  const days: DailyPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = shiftYmd(today, -i);
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

  const currentSessions = sessions.filter((s) => inYmdRange(s.started_at, currentStart, today));
  const previousSessions = sessions.filter((s) =>
    inYmdRange(s.started_at, previousStart, previousEnd),
  );
  const currentIx = interactions.filter((i) => inYmdRange(i.created_at, currentStart, today));
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
    rangeLabel: formatRangeLabel(currentStart, today),
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
    "Share of questions answered from official TIS sources. Grounded answers ÷ (grounded answers + knowledge gaps). Fixed answers and errors are counted separately in Outcome mix.",
} as const;
