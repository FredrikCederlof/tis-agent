import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChartColumn,
  ChevronRight,
  Search,
} from "lucide-react";
import { attentionReason } from "@/lib/dashboard";
import type { KnowledgeGap } from "@/lib/dashboard";
import { IconWell } from "@/components/charts";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function maskParent(waFrom: string | null | undefined): string {
  if (!waFrom) return "—";
  const digits = waFrom.replace(/\D/g, "");
  if (digits.length < 4) return "—";
  return `•• •${digits.slice(-4)}`;
}

function UpDelta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value == null) return null;
  const arrow = value >= 0 ? "↑" : "↓";
  return (
    <span className="ml-2 text-xs font-semibold text-emerald-600">
      {arrow} {Math.abs(value)} {suffix}
    </span>
  );
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
  const rows = [
    {
      label: "Knowledge articles",
      value: articles,
      extra: <UpDelta value={articlesDelta} suffix="this period" />,
    },
    {
      label: "Questions covered",
      value: `${coveragePct}%`,
      extra: <UpDelta value={coverageDelta} suffix="pp" />,
    },
    { label: "Added from parent questions", value: fromParents },
    { label: "Added this period", value: addedThisPeriod },
  ];

  return (
    <section className="card flex h-full flex-col">
      <div className="flex items-center gap-2.5">
        <IconWell>
          <BookOpen className="h-4 w-4" strokeWidth={2.25} />
        </IconWell>
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Knowledge health</h2>
          <p className="text-sm text-tis-muted">Status of your knowledge base</p>
        </div>
      </div>
      <dl className="mt-4 flex-1 divide-y divide-slate-100 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
            <dt className="text-tis-muted">{row.label}</dt>
            <dd className="font-semibold text-tis-navy">
              {row.value}
              {row.extra}
            </dd>
          </div>
        ))}
      </dl>
      <Link href="/knowledge" className="primary mt-5 w-full !no-underline">
        <BookOpen className="h-4 w-4" />
        Open Knowledge Hub
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

export function TopKnowledgeGapsCard({ gaps }: { gaps: KnowledgeGap[] }) {
  return (
    <section className="card flex h-full flex-col">
      <div className="flex items-center gap-2.5">
        <IconWell tone="blue">
          <Search className="h-4 w-4" strokeWidth={2.25} />
        </IconWell>
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Top knowledge gaps</h2>
          <p className="text-sm text-tis-muted">Most common unanswered or low confidence questions</p>
        </div>
      </div>
      {gaps.length === 0 ? (
        <p className="mt-4 flex-1 text-sm text-tis-muted">No repeated gaps in this period.</p>
      ) : (
        <ol className="mt-4 flex-1 space-y-0.5">
          {gaps.map((gap, index) => (
            <li key={`${gap.topic}-${index}`}>
              <Link
                href="/inbox"
                className="group flex items-center gap-3 rounded-xl px-1 py-2 text-sm transition hover:bg-slate-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f3eeff] text-xs font-bold text-[#6b4fd8]">
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 truncate font-medium text-tis-navy">{gap.topic}</p>
                <span className="shrink-0 text-xs text-tis-muted">
                  {gap.count} question{gap.count === 1 ? "" : "s"}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-tis-navy" />
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link
        href="/inbox"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-[#f7f7f5] px-4 py-2.5 text-sm font-semibold text-tis-navy transition hover:bg-tis-mist"
      >
        View all gaps
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

export function TinaLearningCard({
  addedToHub,
  nowCovered,
  fromHuman,
  addedDelta,
  coveredDelta,
  humanDelta,
}: {
  addedToHub: number;
  nowCovered: number;
  fromHuman: number;
  addedDelta?: number | null;
  coveredDelta?: number | null;
  humanDelta?: number | null;
}) {
  const items = [
    {
      value: addedToHub,
      label: "Questions added to Knowledge Hub",
      delta: addedDelta,
    },
    {
      value: nowCovered,
      label: "Previously unanswered questions now covered",
      delta: coveredDelta,
    },
    {
      value: fromHuman,
      label: "Human answers converted to knowledge",
      delta: humanDelta,
    },
  ];

  return (
    <section className="card h-full">
      <div className="flex items-center gap-2.5">
        <IconWell>
          <ChartColumn className="h-4 w-4" strokeWidth={2.25} />
        </IconWell>
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Tina learning</h2>
          <p className="text-sm text-tis-muted">How Tina is improving over time</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <p className="font-display text-3xl font-bold text-tis-navy">{item.value}</p>
            <p className="mt-1 text-xs leading-snug text-tis-muted">{item.label}</p>
            {item.delta ? (
              <p className="mt-1.5 text-xs font-semibold text-emerald-600">
                {item.delta >= 0 ? "↑" : "↓"} {Math.abs(item.delta)} this period
              </p>
            ) : null}
          </div>
        ))}
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
        <div className="flex items-center gap-2.5">
          <IconWell tone="amber">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
          </IconWell>
          <div>
            <h2 className="text-lg font-bold text-tis-navy">Needs attention</h2>
            <p className="text-sm text-tis-muted">Latest questions that need your review</p>
          </div>
        </div>
        <Link href="/inbox" className="inline-flex items-center gap-1 text-sm font-semibold text-tis-navy">
          View all{total > 0 ? ` (${total})` : ""}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-tis-muted">Nothing waiting in Needs attention.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-y border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-2.5">Question</th>
                <th className="px-5 py-2.5">Parent</th>
                <th className="px-5 py-2.5">Asked</th>
                <th className="px-5 py-2.5">Reason</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const reason = attentionReason(row.outcome);
                return (
                  <tr key={row.id} className="border-b border-slate-50 last:border-0">
                    <td className="max-w-md px-5 py-3.5 font-medium text-tis-navy">
                      <Link href={`/chats/${row.session_id}`} className="line-clamp-1 hover:underline">
                        {row.question}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-tis-muted">
                      {maskParent(row.wa_from)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-tis-muted">
                      {relativeTime(row.created_at)}
                    </td>
                    <td className="px-5 py-3.5">
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
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/chats/${row.session_id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-tis-navy transition hover:bg-slate-50"
                      >
                        Open
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
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
