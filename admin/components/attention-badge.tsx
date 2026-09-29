import { AlertCircle } from "lucide-react";

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

/** Subtle list-row treatment for needs-attention conversations. */
export function attentionRowClass(needsAttention: boolean, active: boolean): string {
  if (!needsAttention) return "";
  if (active) return "ring-1 ring-amber-300/70";
  return "border-amber-200/70 bg-amber-50/40";
}
