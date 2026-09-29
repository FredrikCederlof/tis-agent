import { AlertCircle, CheckCircle2 } from "lucide-react";

export function AttentionBadge({
  count,
  size = "md",
}: {
  count?: number | null;
  size?: "sm" | "md";
}) {
  const label =
    count != null && count > 1 ? `${count} needs attention` : "Needs attention";
  const pad =
    size === "sm"
      ? "gap-1 px-2 py-0.5 text-[10px]"
      : "gap-1.5 px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 font-bold uppercase tracking-wide text-amber-950 ${pad}`}
      role="status"
    >
      <AlertCircle
        className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"}
        aria-hidden
      />
      {label}
    </span>
  );
}

/**
 * Full-width status card for Session information — clearer than a tiny pill.
 * Shows whether this session currently needs a human, and how many questions.
 */
export function AttentionStatusCard({
  needsAttention,
  count = 0,
}: {
  needsAttention: boolean;
  count?: number | null;
}) {
  const n = count ?? 0;
  if (needsAttention) {
    return (
      <div
        className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left"
        role="status"
        aria-label={`${n || 1} question${n === 1 ? "" : "s"} need attention`}
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-amber-950">Needs attention</p>
            <p className="mt-0.5 text-[11px] leading-snug text-amber-900/90">
              {n > 0
                ? `${n} question${n === 1 ? "" : "s"} in this session still need a human reply or Knowledge Hub entry.`
                : "This session is flagged for a human follow-up."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-left"
      role="status"
      aria-label="No attention needed"
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-emerald-950">No attention needed</p>
          <p className="mt-0.5 text-[11px] leading-snug text-emerald-900/80">
            Nothing in this session is flagged for a human follow-up.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Subtle list-row treatment for needs-attention conversations. */
export function attentionRowClass(needsAttention: boolean, active: boolean): string {
  if (!needsAttention) return "";
  if (active) return "ring-1 ring-amber-300/70";
  return "border-amber-200/70 bg-amber-50/40";
}
