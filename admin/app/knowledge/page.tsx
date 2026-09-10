import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { KnowledgeCategories } from "@/components/knowledge-categories";
import { KnowledgeList } from "@/components/knowledge-list";
import { StatCard } from "@/components/stat-card";
import {
  KPI_DEFINITIONS,
  buildDashboardModel,
  defaultDateRange,
  fetchUntilIso,
  tokyoDayStart,
  type InteractionRow,
} from "@/lib/dashboard";
import { showCategoryLanding } from "@/lib/knowledge-hub";
import type { KnowledgeEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KnowledgeHubPage({
  searchParams,
}: {
  searchParams?: { added?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { from, to } = defaultDateRange();
  const periodStart = tokyoDayStart(from).toISOString();
  const until = fetchUntilIso(to);

  const [{ data, error }, { count }, { data: interactions }] = await Promise.all([
    supabase
      .from("knowledge_entries")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
    supabase
      .from("interactions")
      .select("created_at, outcome, question, human_replied_at")
      .gte("created_at", periodStart)
      .lte("created_at", until)
      .limit(10000),
  ]);

  const rows = (data || []) as KnowledgeEntry[];
  const active = rows.filter((row) => row.status === "active");
  const articles = active.length;
  const fromParents = active.filter((row) => row.origin === "inbox").length;
  const addedThisPeriod = active.filter(
    (row) => row.created_at >= periodStart && row.created_at <= until,
  ).length;
  const coveragePct = buildDashboardModel(
    (interactions || []) as InteractionRow[],
    from,
    to,
  ).current.knowledgeCoveragePct;
  const useCategories = showCategoryLanding(articles);
  const justAdded = searchParams?.added === "1";

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <div className="pb-10">
        <PageHeader
          title="Knowledge Hub"
          subtitle="Curated parent Q&A that Tina retrieves from the same RAG store as handbooks and calendars."
          actions={
            <Link href="/knowledge/new" className="primary">
              Add entry
            </Link>
          }
        />
        <div className="relative z-10 mb-6 grid gap-4 overflow-visible sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Knowledge articles"
            value={articles}
            definition={KPI_DEFINITIONS.knowledgeArticles}
            accent="green"
            delta={addedThisPeriod}
            deltaLabel="this period"
            deltaUnit=""
          />
          <StatCard
            label="Questions covered"
            value={`${coveragePct}%`}
            detail="of questions covered"
            definition={KPI_DEFINITIONS.knowledgeCoverage}
            accent="blue"
          />
          <StatCard
            label="Added from parent questions"
            value={fromParents}
            definition={KPI_DEFINITIONS.addedFromParents}
            accent="purple"
          />
          <StatCard
            label="Added this period"
            value={addedThisPeriod}
            definition={KPI_DEFINITIONS.addedThisPeriod}
            accent="amber"
            tipAlign="end"
          />
        </div>
        {justAdded && (
          <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-tis-success">
            Saved and ingested. Tina can use this entry now.
          </p>
        )}
        {error ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">
            Could not load Knowledge Hub. Run <code>sql/010_knowledge_hub.sql</code> in
            Supabase, then refresh. {error.message}
          </p>
        ) : useCategories ? (
          <KnowledgeCategories rows={rows} />
        ) : (
          <KnowledgeList rows={rows} />
        )}
      </div>
    </AppShell>
  );
}
