/** Tokyo week helpers for dashboard performance chart (no path aliases). */

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

/** Monday YMD of the calendar week containing `ymd` (weeks start Monday). */
export function weekStartYmd(ymd: string): string {
  // Treat the YMD string as a civil date (Asia/Tokyo calendar) without UTC-midnight drift.
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = (utc.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  utc.setUTCDate(utc.getUTCDate() - dow);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatWeekLabel(weekStart: string): string {
  const end = shiftYmd(weekStart, 6);
  const left = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    month: "short",
    day: "numeric",
  }).format(tokyoDayStart(weekStart));
  const right = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    month: "short",
    day: "numeric",
  }).format(tokyoDayStart(end));
  return `${left}–${right}`;
}

export type WeekAggDay = {
  key: string;
  questions: number;
  gaps: number;
  success: number;
  tinaHandled: number;
};

export type WeeklyPoint = {
  key: string;
  label: string;
  questions: number;
  gaps: number;
  success: number;
  tinaHandled: number;
  answeredPct: number;
  attentionPct: number;
};

/** Collapse daily points into Monday-start weeks (Asia/Tokyo). */
export function buildWeeklySeries(days: WeekAggDay[]): WeeklyPoint[] {
  const weeks: WeeklyPoint[] = [];
  const byWeek = new Map<string, WeeklyPoint>();
  for (const day of days) {
    const key = weekStartYmd(day.key);
    let week = byWeek.get(key);
    if (!week) {
      week = {
        key,
        label: formatWeekLabel(key),
        questions: 0,
        gaps: 0,
        success: 0,
        tinaHandled: 0,
        answeredPct: 0,
        attentionPct: 0,
      };
      byWeek.set(key, week);
      weeks.push(week);
    }
    week.questions += day.questions;
    week.gaps += day.gaps;
    week.success += day.success;
    week.tinaHandled += day.tinaHandled;
  }
  for (const week of weeks) {
    const denom = week.success + week.gaps;
    week.answeredPct = denom > 0 ? Math.round((week.success / denom) * 100) : 0;
    week.attentionPct =
      week.questions > 0 ? Math.round((week.gaps / week.questions) * 100) : 0;
  }
  return weeks;
}
