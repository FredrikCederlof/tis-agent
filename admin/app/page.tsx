import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { OutcomeDonut, PerformanceChart } from "@/components/charts";
import { RefreshButton } from "@/components/refresh-button";
import { DashboardDateRange } from "@/components/dashboard-date-range";
import {
  KnowledgeHealthCard,
  NeedsAttentionTable,
  TinaLearningCard,
  TopKnowledgeGapsCard,
} from "@/components/dashboard-panels";
import {
  KPI_DEFINITIONS,
  buildDashboardModel,
  fetchSinceIso,
  fetchUntilIso,
  percentChange,
  percentagePointChange,
  resolveDateRange,
  type InteractionRow,
} from "@/lib/dashboard";
import type { KnowledgeEntry, UnansweredRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { from, to } = resolveDateRange(searchParams?.from, searchParams?.to);
  const since = fetchSinceIso(from, to);
  const until = fetchUntilIso(to);

  const [
    { data: interactions },
    unansweredRes,
    { data: knowledgeRows },
    { count: previousArticleCount },
  ] = await Promise.all([
    supabase
      .from("interactions")
      .select("created_at, outcome, question, human_replied_at")
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(10000),
    supabase
      .from("unanswered_interactions")
      .select("id, session_id, question, outcome, created_at, wa_from", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("knowledge_entries")
      .select("id, origin, origin_interaction_id, created_at, status")
      .eq("status", "active")
      .limit(5000),
    supabase
      .from("knowledge_entries")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lt("created_at", since),
  ]);

  const dash = buildDashboardModel((interactions || []) as InteractionRow[], from, to);
  const { current, previous, days, dayCount, topGaps } = dash;
  const unansweredCount = unansweredRes.count ?? 0;
  const periodNoun = dayCount === 1 ? "day" : "days";
  const entries = (knowledgeRows || []) as Pick<
    KnowledgeEntry,
    "id" | "origin" | "origin_interaction_id" | "created_at" | "status"
  >[];

  const articles = entries.length;
  const addedThisPeriod = entries.filter(
    (e) => e.created_at >= since && e.created_at <= until,
  ).length;
  const fromParents = entries.filter(
    (e) => e.origin === "inbox" && e.created_at >= since && e.created_at <= until,
  ).length;
  const humanConverted = fromParents;
  const groundedDenom = current.successCount + current.gapCount;
  // Exclusive outcome slices for the donut (avoid double-counting human_replied_at on gaps).
  const humanSlice = current.fixedCount;

  const attentionShare =
    current.questions > 0
      ? Math.round((unansweredCount / Math.max(current.questions, 1)) * 1000) / 10
      : 0;

  return (
    <AppShell email={user.email || ""} unansweredCount={unansweredCount}>
      <div className="mb-6 grid gap-4 sm:mb-8 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            An overview of Tina&apos;s performance, knowledge and what needs your attention.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-tis-navy/10 bg-tis-mist px-3 py-1.5 text-sm font-semibold text-tis-navy">
            <span className="h-2 w-2 rounded-full bg-tis-navy" />
            All systems operational
          </p>
          <DashboardDateRange from={from} to={to} />
          <RefreshButton />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total questions"
          value={current.questions}
          definition={KPI_DEFINITIONS.totalQuestions}
          accent="green"
          sparkline={days.map((d) => d.questions)}
          delta={percentChange(current.questions, previous.questions)}
          deltaLabel={`vs previous ${dayCount} ${periodNoun}`}
        />
        <StatCard
          label="Answered by Tina"
          value={`${current.answeredByTinaPct}%`}
          detail={`${current.successCount} of ${groundedDenom || current.questions} grounded vs gaps`}
          definition={KPI_DEFINITIONS.answeredByTina}
          accent="purple"
          sparkline={days.map((d) => d.answeredPct)}
          delta={percentagePointChange(current.answeredByTinaPct, previous.answeredByTinaPct)}
          deltaLabel={`vs previous ${dayCount} ${periodNoun}`}
          deltaUnit=" pp"
        />
        <StatCard
          label="Needs attention"
          value={unansweredCount}
          detail={
            current.questions > 0
              ? `${attentionShare}% of period volume · open queue`
              : "Open queue"
          }
          definition={KPI_DEFINITIONS.needsAttention}
          accent="amber"
          sparkline={days.map((d) => d.gaps)}
          delta={percentChange(current.gapCount, previous.gapCount)}
          deltaLabel={`gap volume vs previous ${dayCount} ${periodNoun}`}
        />
        <StatCard
          label="Knowledge coverage"
          value={`${current.knowledgeCoveragePct}%`}
          detail="Grounded + fixed answers / questions"
          definition={KPI_DEFINITIONS.knowledgeCoverage}
          accent="blue"
          sparkline={days.map((d) =>
            d.questions > 0 ? Math.round((d.success / d.questions) * 100) : 0,
          )}
          delta={percentagePointChange(
            current.knowledgeCoveragePct,
            previous.knowledgeCoveragePct,
          )}
          deltaLabel={`vs previous ${dayCount} ${periodNoun}`}
          deltaUnit=" pp"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <section className="card">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-tis-navy">Tina performance over time</h2>
              <p className="text-sm text-tis-muted">
                Automation vs attention for the selected {dayCount} {periodNoun}
              </p>
            </div>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-tis-muted">
              Daily
            </span>
          </div>
          <PerformanceChart points={days} />
        </section>

        <section className="card">
          <h2 className="mb-1 text-lg font-bold text-tis-navy">Answer outcomes</h2>
          <p className="mb-4 text-sm text-tis-muted">How questions were handled in this period</p>
          <OutcomeDonut
            success={current.successCount}
            gaps={current.gapCount}
            human={humanSlice}
            errors={current.errorCount}
          />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <KnowledgeHealthCard
          articles={articles}
          articlesDelta={
            previousArticleCount == null ? addedThisPeriod : articles - (previousArticleCount || 0)
          }
          coveragePct={current.knowledgeCoveragePct}
          coverageDelta={percentagePointChange(
            current.knowledgeCoveragePct,
            previous.knowledgeCoveragePct,
          )}
          fromParents={fromParents}
          addedThisPeriod={addedThisPeriod}
        />
        <TopKnowledgeGapsCard gaps={topGaps} />
        <div className="flex flex-col gap-6 lg:col-span-2 xl:col-span-1">
          <TinaLearningCard
            addedToHub={addedThisPeriod}
            nowCovered={fromParents}
            fromHuman={humanConverted}
          />
        </div>
      </div>

      <div className="mt-6">
        <NeedsAttentionTable
          rows={(unansweredRes.data || []) as UnansweredRow[]}
          total={unansweredCount}
        />
      </div>
    </AppShell>
  );
}
