import Link from "next/link";
import type { UnansweredRow } from "@/lib/types";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusLabel(outcome: string): { label: string; className: string } {
  if (outcome === "low_confidence") {
    return { label: "Low confidence", className: "bg-amber-50 text-amber-700" };
  }
  return { label: "New", className: "bg-rose-50 text-tis-danger" };
}

export function UnansweredPreview({
  rows,
  total,
}: {
  rows: Pick<UnansweredRow, "id" | "question" | "outcome" | "created_at">[];
  total: number;
}) {
  return (
    <section className="card !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Unanswered questions</h2>
          <p className="text-sm text-tis-muted">Gaps waiting for a knowledge or config fix</p>
        </div>
        <Link href="/inbox" className="text-sm font-semibold text-tis-sky hover:underline">
          Open inbox{total > 0 ? ` (${total})` : ""}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-tis-muted">
          No open gaps — Tina has no unanswered questions waiting for review.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-y border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Question</th>
                <th className="px-5 py-2.5 font-semibold">Asked</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = statusLabel(row.outcome);
                return (
                  <tr key={row.id} className="border-b border-slate-50 last:border-0">
                    <td className="max-w-xl px-5 py-3 font-medium text-tis-navy">
                      <span className="line-clamp-2">{row.question}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-tis-muted">
                      {relativeTime(row.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
