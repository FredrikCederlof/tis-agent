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
  tokyoDayStart,
  type InteractionRow,
} from "@/lib/dashboard";
import type { KnowledgeEntry } from "@/lib/types";

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

  const [{ data: interactions }, unansweredRes, { data: knowledgeRows }] = await Promise.all([
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
  ]);

  const dash = buildDashboardModel((interactions || []) as InteractionRow[], from, to);
  const { current, previous, days, dayCount, topGaps } = dash;
  const unansweredCount = unansweredRes.count ?? 0;
  const periodNoun = dayCount === 1 ? "day" : "days";
  const entries = (knowledgeRows || []) as Pick<
    KnowledgeEntry,
    "id" | "origin" | "origin_interaction_id" | "created_at" | "status"
  >[];

  const periodStartIso = tokyoDayStart(from).toISOString();
  const inCurrent = (iso: string) => iso >= periodStartIso && iso <= until;

  const articles = entries.length;
  const addedThisPeriod = entries.filter((e) => inCurrent(e.created_at)).length;
  const fromParents = entries.filter((e) => e.origin === "inbox").length;
  const fromParentsThisPeriod = entries.filter(
    (e) => e.origin === "inbox" && inCurrent(e.created_at),
  ).length;
  const fromHumanThisPeriod = entries.filter(
    (e) => e.origin === "inbox" && Boolean(e.origin_interaction_id) && inCurrent(e.created_at),
  ).length;
  const humanSlice = current.fixedCount;
  const attentionShare =
    current.questions > 0
      ? Math.round((unansweredCount / Math.max(current.questions, 1)) * 1000) / 10
      : 0;
  const dayLabels = days.map((d) => d.label);
  const chartRangeLabel = `Last ${dayCount} ${periodNoun}`;
  const vsPrevious = `vs previous ${dayCount} ${periodNoun}`;
  const attentionDelta = current.gapCount - previous.gapCount;

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
          sparklineLabels={dayLabels}
          delta={percentChange(current.questions, previous.questions)}
          deltaLabel={vsPrevious}
        />
        <StatCard
          label="Answered by Tina"
          value={`${current.answeredByTinaPct}%`}
          detail={`${current.successCount} of ${current.questions}`}
          definition={KPI_DEFINITIONS.answeredByTina}
          accent="purple"
          sparkline={days.map((d) => d.answeredPct)}
          sparklineLabels={dayLabels}
          sparkFormat="percent"
          delta={percentagePointChange(current.answeredByTinaPct, previous.answeredByTinaPct)}
          deltaLabel={vsPrevious}
          deltaUnit=" percentage points"
        />
        <StatCard
          label="Needs attention"
          value={unansweredCount}
          detail={current.questions > 0 ? `${attentionShare}% of questions` : "Open queue"}
          definition={KPI_DEFINITIONS.needsAttention}
          accent="amber"
          sparkline={days.map((d) => d.gaps)}
          sparklineLabels={dayLabels}
          delta={attentionDelta}
          deltaLabel={vsPrevious}
          deltaUnit=""
        />
        <StatCard
          label="Knowledge coverage"
          value={`${current.knowledgeCoveragePct}%`}
          detail="of questions covered"
          definition={KPI_DEFINITIONS.knowledgeCoverage}
          accent="blue"
          sparkline={days.map((d) =>
            d.questions > 0 ? Math.round((d.success / d.questions) * 100) : 0,
          )}
          sparklineLabels={dayLabels}
          sparkFormat="percent"
          delta={percentagePointChange(
            current.knowledgeCoveragePct,
            previous.knowledgeCoveragePct,
          )}
          deltaLabel={vsPrevious}
          deltaUnit=" percentage points"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <section className="card flex min-h-[360px] flex-col">
          <div className="min-h-0 flex-1">
            <PerformanceChart
              rangeLabel={chartRangeLabel}
              points={days.map((d) => ({
                label: d.label,
                questions: d.questions,
                answeredPct: d.answeredPct,
                attentionPct: d.attentionPct,
              }))}
            />
          </div>
        </section>

        <section className="card flex min-h-[360px] flex-col">
          <div className="min-h-0 flex-1">
            <OutcomeDonut
              success={current.successCount}
              gaps={current.gapCount}
              human={humanSlice}
              errors={current.errorCount}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <KnowledgeHealthCard
          articles={articles}
          articlesDelta={addedThisPeriod}
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
            nowCovered={fromParentsThisPeriod}
            fromHuman={fromHumanThisPeriod}
            addedDelta={addedThisPeriod}
            coveredDelta={fromParentsThisPeriod}
            humanDelta={fromHumanThisPeriod}
          />
        </div>
      </div>

      <div className="mt-6">
        <NeedsAttentionTable
          rows={(unansweredRes.data || []) as {
            id: string;
            session_id: string;
            question: string;
            outcome: string;
            created_at: string;
            wa_from?: string | null;
          }[]}
          total={unansweredCount}
        />
      </div>
    </AppShell>
  );
}
