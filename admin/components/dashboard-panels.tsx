import Link from "next/link";
import { attentionReason } from "@/lib/dashboard";
import type { KnowledgeGap } from "@/lib/dashboard";

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

function maskParent(waFrom: string | null | undefined): string {
  if (!waFrom) return "—";
  const digits = waFrom.replace(/\D/g, "");
  if (digits.length < 4) return "…";
  return `…${digits.slice(-4)}`;
}

export function KnowledgeHealthCard({
  articles,
  articlesDelta,
  coveragePct,
  coverageDelta,
  fromParents,
  addedThisPeriod,
}: {
  articles: number;
  articlesDelta: number | null;
  coveragePct: number;
  coverageDelta: number | null;
  fromParents: number;
  addedThisPeriod: number;
}) {
  return (
    <section className="card flex h-full flex-col">
      <h2 className="text-lg font-bold text-tis-navy">Knowledge health</h2>
      <p className="mt-1 text-sm text-tis-muted">Hub articles and coverage for the selected range</p>
      <dl className="mt-4 flex-1 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-tis-muted">Knowledge articles</dt>
          <dd className="font-semibold text-tis-navy">
            {articles}
            {articlesDelta != null ? (
              <span className="ml-1 text-xs font-medium text-tis-muted">
                {articlesDelta >= 0 ? "↑" : "↓"} {Math.abs(articlesDelta)}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-tis-muted">Questions covered</dt>
          <dd className="font-semibold text-tis-navy">
            {coveragePct}%
            {coverageDelta != null ? (
              <span className="ml-1 text-xs font-medium text-tis-muted">
                {coverageDelta >= 0 ? "↑" : "↓"} {Math.abs(coverageDelta)} pp
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-tis-muted">Added from parent questions</dt>
          <dd className="font-semibold text-tis-navy">{fromParents}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-tis-muted">Added this period</dt>
          <dd className="font-semibold text-tis-navy">{addedThisPeriod}</dd>
        </div>
      </dl>
      <Link href="/knowledge" className="primary mt-5 w-full !no-underline">
        Open Knowledge Hub
      </Link>
    </section>
  );
}

export function TopKnowledgeGapsCard({ gaps }: { gaps: KnowledgeGap[] }) {
  return (
    <section className="card flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Top knowledge gaps</h2>
          <p className="mt-1 text-sm text-tis-muted">Most common unanswered questions in range</p>
        </div>
        <Link href="/inbox" className="shrink-0 text-sm font-semibold text-tis-sky hover:underline">
          View all gaps
        </Link>
      </div>
      {gaps.length === 0 ? (
        <p className="mt-4 text-sm text-tis-muted">No repeated gaps in this period.</p>
      ) : (
        <ol className="mt-4 flex-1 space-y-2.5">
          {gaps.map((gap, index) => (
            <li key={`${gap.topic}-${index}`} className="flex items-start gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tis-mist text-xs font-bold text-tis-navy">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-tis-navy">{gap.topic}</p>
                <p className="text-xs text-tis-muted">
                  {gap.count} question{gap.count === 1 ? "" : "s"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function TinaLearningCard({
  addedToHub,
  nowCovered,
  fromHuman,
}: {
  addedToHub: number;
  nowCovered: number;
  fromHuman: number;
}) {
  return (
    <section className="card">
      <h2 className="text-lg font-bold text-tis-navy">Tina learning</h2>
      <p className="mt-1 text-sm text-tis-muted">How the Knowledge Hub grew in this period</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="font-display text-2xl font-bold text-tis-navy">{addedToHub}</p>
          <p className="mt-1 text-xs text-tis-muted">Questions added to Knowledge Hub</p>
        </div>
        <div>
          <p className="font-display text-2xl font-bold text-tis-navy">{nowCovered}</p>
          <p className="mt-1 text-xs text-tis-muted">Previously unanswered now covered</p>
        </div>
        <div>
          <p className="font-display text-2xl font-bold text-tis-navy">{fromHuman}</p>
          <p className="mt-1 text-xs text-tis-muted">Human answers converted to knowledge</p>
        </div>
      </div>
    </section>
  );
}

export function NeedsAttentionTable({
  rows,
  total,
}: {
  rows: {
    id: string;
    session_id: string;
    question: string;
    outcome: string;
    created_at: string;
    wa_from?: string | null;
  }[];
  total: number;
}) {
  return (
    <section className="card !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Needs attention</h2>
          <p className="text-sm text-tis-muted">Latest open gaps and flagged questions</p>
        </div>
        <Link href="/inbox" className="text-sm font-semibold text-tis-sky hover:underline">
          View all{total > 0 ? ` (${total})` : ""}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-tis-muted">Nothing waiting in Needs attention.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-y border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Question</th>
                <th className="px-5 py-2.5">Parent</th>
                <th className="px-5 py-2.5">Asked</th>
                <th className="px-5 py-2.5">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const reason = attentionReason(row.outcome);
                return (
                  <tr key={row.id} className="border-b border-slate-50 last:border-0">
                    <td className="max-w-md px-5 py-3 font-medium text-tis-navy">
                      <Link
                        href={`/chats/${row.session_id}`}
                        className="line-clamp-2 hover:underline"
                      >
                        {row.question}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-tis-muted">
                      {maskParent(row.wa_from)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-tis-muted">
                      {relativeTime(row.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          reason.tone === "amber"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-tis-danger"
                        }`}
                      >
                        {reason.label}
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
