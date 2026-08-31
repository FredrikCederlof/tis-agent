import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { KnowledgeList } from "@/components/knowledge-list";
import type { KnowledgeEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KnowledgeHubPage() {
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
      {error ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">
          Could not load Knowledge Hub. Run <code>sql/010_knowledge_hub.sql</code> in
          Supabase, then refresh. {error.message}
        </p>
      ) : (
        <KnowledgeList rows={(data || []) as KnowledgeEntry[]} />
      )}
    </AppShell>
  );
}
