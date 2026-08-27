import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import type { StatsRow } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: stats } = await supabase.from("admin_stats_7d").select("*").single();
  const row = (stats || {}) as StatsRow;

  const answered = row.success_count ?? 0;
  const gaps = row.gap_count ?? 0;
  const total = answered + gaps;
  const successRate = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div>
      <Nav email={user.email || ""} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-6 text-2xl font-semibold text-tis-navy">Last 7 days</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Sessions" value={row.sessions ?? 0} />
          <StatCard label="Questions" value={row.questions ?? 0} />
          <StatCard
            label="Avg questions / session"
            value={row.avg_questions_per_session ?? "—"}
          />
          <StatCard label="Success rate" value={`${successRate}%`} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Grounded answers" value={row.success_count ?? 0} />
          <StatCard label="Knowledge gaps" value={row.gap_count ?? 0} />
          <StatCard label="Fixed answers" value={row.fixed_answer_count ?? 0} />
          <StatCard label="Errors" value={row.error_count ?? 0} />
        </div>
        <p className="hint mt-6">
          Success rate = grounded answers ÷ (grounded + knowledge gaps). Fixed answers and
          errors are shown separately.
        </p>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-tis-navy">{value}</p>
    </div>
  );
}
