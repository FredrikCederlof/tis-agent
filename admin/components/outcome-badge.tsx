import { AlertTriangle, Bot, CheckCircle2, HelpCircle, Wrench } from "lucide-react";
import { outcomeLabel, outcomeTone } from "@/lib/chat-presentation";

const TONE_CLASS: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300/80 bg-amber-50 text-amber-950",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

function OutcomeIcon({
  outcome,
  className,
}: {
  outcome: string;
  className?: string;
}) {
  const cls = className || "h-3.5 w-3.5";
  if (outcome === "success") return <CheckCircle2 className={cls} aria-hidden />;
  if (outcome === "low_confidence") return <AlertTriangle className={cls} aria-hidden />;
  if (outcome === "no_evidence") return <Bot className={cls} aria-hidden />;
  if (outcome === "fixed_answer") return <Wrench className={cls} aria-hidden />;
  if (outcome === "error") return <HelpCircle className={cls} aria-hidden />;
  return <HelpCircle className={cls} aria-hidden />;
}

export function OutcomeBadge({
  outcome,
  count,
  size = "md",
}: {
  outcome: string | null | undefined;
  count?: number | null;
  size?: "sm" | "md";
}) {
  if (!outcome) return null;
  const label = outcomeLabel(outcome);
  const tone = outcomeTone(outcome);
  const pad =
    size === "sm"
      ? "gap-1 px-1.5 py-0.5 text-[10px]"
      : "gap-1.5 px-2 py-0.5 text-[11px]";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const display =
    count != null && count > 0 ? `${label} · ${count}` : label;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold ${TONE_CLASS[tone]} ${pad}`}
      aria-label={count != null && count > 0 ? `${label}, ${count}` : label}
      title={label}
    >
      <OutcomeIcon outcome={outcome} className={iconSize} />
      {display}
    </span>
  );
}

/** Stacked outcome rows for Session information — label left, count right. */
export function OutcomeSummaryList({
  outcomes,
}: {
  outcomes: Record<string, number>;
}) {
  const entries = Object.entries(outcomes);
  if (entries.length === 0) {
    return <p className="text-xs text-tis-muted">No logged answers in this session.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {entries.map(([outcome, count]) => (
        <li
          key={outcome}
          className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5"
        >
          <OutcomeBadge outcome={outcome} size="sm" />
          <span className="shrink-0 text-xs font-bold tabular-nums text-tis-navy">
            {count}
          </span>
        </li>
      ))}
    </ul>
  );
}
