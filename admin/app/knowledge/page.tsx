import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { KnowledgeCategories } from "@/components/knowledge-categories";
import { KnowledgeList } from "@/components/knowledge-list";
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

  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from("knowledge_entries")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
  ]);

  const rows = (data || []) as KnowledgeEntry[];
  const activeCount = rows.filter((row) => row.status === "active").length;
  const useCategories = showCategoryLanding(activeCount);
  const justAdded = searchParams?.added === "1";

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <PageHeader
        title="Knowledge Hub"
        subtitle="Curated parent Q&A that Tina retrieves from the same RAG store as handbooks and calendars."
        actions={
          <Link href="/knowledge/new" className="primary">
            Add entry
          </Link>
        }
      />
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
    </AppShell>
  );
}
