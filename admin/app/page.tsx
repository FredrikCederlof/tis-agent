import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { RecentActivity } from "@/components/recent-activity";
import { ActivityChart, OutcomeDonut } from "@/components/charts";
import type { StatsRow } from "@/lib/types";

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: stats }, { data: recent }, unansweredRes, { data: timeline }] =
    await Promise.all([
      supabase.from("admin_stats_7d").select("*").single(),
      supabase
        .from("interactions")
        .select("id, question, outcome, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
      supabase
        .from("interactions")
        .select("created_at, outcome")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: true }),
    ]);

  const row = (stats || {}) as StatsRow;
  const answered = row.success_count ?? 0;
  const gaps = row.gap_count ?? 0;
  const total = answered + gaps;
  const successRate = total > 0 ? Math.round((answered / total) * 100) : 0;
  const unansweredCount = unansweredRes.count ?? 0;

  // Build daily buckets for the last 7 days
  const days: { label: string; key: string; sessions: number; questions: number; gaps: number }[] =
    [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: dayLabel(d.toISOString()),
      sessions: 0,
      questions: 0,
      gaps: 0,
    });
  }
  const byDay = Object.fromEntries(days.map((d) => [d.key, d]));
  for (const item of timeline || []) {
    const key = new Date(item.created_at).toISOString().slice(0, 10);
    if (!byDay[key]) continue;
    byDay[key].questions += 1;
    byDay[key].sessions += 1; // approx: one interaction ≈ session touch
    if (item.outcome === "no_evidence" || item.outcome === "low_confidence") {
      byDay[key].gaps += 1;
    }
  }

  const rangeLabel = `${days[0]?.label ?? ""} – ${days[days.length - 1]?.label ?? ""}`;

  return (
    <AppShell email={user.email || ""} unansweredCount={unansweredCount}>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of Tina’s performance and usage."
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-tis-muted shadow-sm">
              {rangeLabel}
            </span>
            <Link href="/" className="secondary !px-3 !py-2 text-xs">
              Refresh
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sessions" value={row.sessions ?? 0} icon="sessions" tone="navy" hint="Last 7 days" />
        <StatCard label="Questions" value={row.questions ?? 0} icon="questions" tone="navy" hint="Last 7 days" />
        <StatCard
          label="Avg questions / session"
          value={row.avg_questions_per_session ?? "—"}
          icon="avg"
          tone="gold"
        />
        <StatCard
          label="Success rate"
          value={`${successRate}%`}
          icon="success"
          tone="green"
          hint="Grounded ÷ (grounded + gaps)"
        />
        <StatCard label="Grounded answers" value={row.success_count ?? 0} icon="grounded" tone="green" />
        <StatCard label="Knowledge gaps" value={row.gap_count ?? 0} icon="gaps" tone="red" />
        <StatCard label="Fixed answers" value={row.fixed_answer_count ?? 0} icon="fixed" tone="navy" />
        <StatCard label="Errors" value={row.error_count ?? 0} icon="errors" tone="red" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
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
            success={row.success_count ?? 0}
            gaps={row.gap_count ?? 0}
            fixed={row.fixed_answer_count ?? 0}
            errors={row.error_count ?? 0}
          />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-tis-navy">Recent activity</h2>
            <Link href="/inbox" className="text-sm font-semibold text-tis-sky hover:underline">
              Open inbox
            </Link>
          </div>
          <RecentActivity items={recent || []} />
        </section>

        <section className="card flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-tis-navy">System status</h2>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-tis-success">
              <span className="h-2 w-2 rounded-full bg-tis-success" />
              All systems operational
            </p>
            <p className="mt-3 text-sm leading-relaxed text-tis-muted">
              WhatsApp webhook on Railway, knowledge in Supabase, and admin config are connected.
              Use Knowledge sync after the school updates the calendar or IT portal.
            </p>
          </div>
          <Link href="/sync" className="primary w-full sm:w-auto">
            View knowledge sync
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
