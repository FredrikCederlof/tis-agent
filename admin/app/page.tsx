import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { ActivityChart, OutcomeDonut } from "@/components/charts";
import { UnansweredPreview } from "@/components/unanswered-preview";
import { RefreshButton } from "@/components/refresh-button";
import {
  KPI_DEFINITIONS,
  buildDashboardModel,
  fetchSinceIso,
  percentChange,
  type InteractionRow,
  type SessionRow,
} from "@/lib/dashboard";
import type { UnansweredRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const since = fetchSinceIso();
  const [{ data: sessions }, { data: interactions }, unansweredRes] = await Promise.all([
    supabase
      .from("chat_sessions")
      .select("id, started_at")
      .gte("started_at", since)
      .limit(5000),
    supabase
      .from("interactions")
      .select("created_at, outcome")
      .gte("created_at", since)
      .limit(5000),
    supabase
      .from("unanswered_interactions")
      .select("id, question, outcome, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const dash = buildDashboardModel(
    (sessions || []) as SessionRow[],
    (interactions || []) as InteractionRow[],
  );
  const { current, previous, days, rangeLabel } = dash;
  const unansweredCount = unansweredRes.count ?? 0;

  return (
    <AppShell email={user.email || ""} unansweredCount={unansweredCount}>
      <div className="mb-6 grid gap-4 sm:mb-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of Tina’s performance and health</p>
        </div>
        <p className="inline-flex w-fit items-center gap-2 justify-self-start rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-tis-success lg:justify-self-center">
          <span className="h-2 w-2 rounded-full bg-tis-success" />
          All systems operational
        </p>
        <div className="flex items-center gap-2 lg:justify-self-end">
          <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-tis-muted shadow-sm">
            {rangeLabel}
          </span>
          <RefreshButton />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sessions"
          value={current.sessions}
          definition={KPI_DEFINITIONS.sessions}
          icon="sessions"
          tone="blue"
          sparkline={days.map((d) => d.sessions)}
          delta={percentChange(current.sessions, previous.sessions)}
        />
        <StatCard
          label="Questions"
          value={current.questions}
          definition={KPI_DEFINITIONS.questions}
          icon="questions"
          tone="green"
          sparkline={days.map((d) => d.questions)}
          delta={percentChange(current.questions, previous.questions)}
        />
        <StatCard
          label="Avg. questions / session"
          value={
            current.avgQuestionsPerSession == null
              ? "—"
              : current.avgQuestionsPerSession.toFixed(2)
          }
          definition={KPI_DEFINITIONS.avg}
          icon="avg"
          tone="purple"
          sparkline={days.map((d) =>
            d.sessions > 0 ? Math.round((d.questions / d.sessions) * 100) / 100 : 0,
          )}
          delta={percentChange(
            current.avgQuestionsPerSession ?? 0,
            previous.avgQuestionsPerSession ?? 0,
          )}
        />
        <StatCard
          label="Success rate"
          value={`${current.successRate}%`}
          definition={KPI_DEFINITIONS.success}
          icon="success"
          tone="teal"
          sparkline={days.map((d) => {
            const denom = d.success + d.gaps;
            return denom > 0 ? Math.round((d.success / denom) * 100) : 0;
          })}
          delta={percentChange(current.successRate, previous.successRate)}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <section className="card">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-tis-navy">Activity over time</h2>
              <p className="text-sm text-tis-muted">Daily WhatsApp volume for the past week</p>
            </div>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-tis-muted">
              Daily
            </span>
          </div>
          <ActivityChart points={days} />
        </section>

        <section className="card">
          <h2 className="mb-1 text-lg font-bold text-tis-navy">Outcome mix</h2>
          <p className="mb-4 text-sm text-tis-muted">How Tina classified answers this week</p>
          <OutcomeDonut
            success={current.successCount}
            gaps={current.gapCount}
            fixed={current.fixedCount}
            errors={current.errorCount}
          />
        </section>
      </div>

      <div className="mt-6">
        <UnansweredPreview
          rows={(unansweredRes.data || []) as UnansweredRow[]}
          total={unansweredCount}
        />
      </div>
    </AppShell>
  );
}
