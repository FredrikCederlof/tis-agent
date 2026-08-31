import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { KnowledgeList } from "@/components/knowledge-list";
import {
  UNCATEGORIZED,
  categoryFromSlug,
  categoryLabel,
  entriesInCategory,
} from "@/lib/knowledge-hub";
import type { KnowledgeEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KnowledgeCategoryPage({
  params,
}: {
  params: { name: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const category = categoryFromSlug(params.name);
  const title = category ?? UNCATEGORIZED;

  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from("knowledge_entries")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
  ]);

  if (error) {
    notFound();
  }

  const rows = entriesInCategory((data || []) as KnowledgeEntry[], category);
  if (rows.length === 0 && categoryLabel(category) !== title) {
    notFound();
  }

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <PageHeader
        title={title}
        subtitle="Knowledge Hub entries in this category."
        actions={
          <Link href="/knowledge" className="secondary">
            All categories
          </Link>
        }
      />
      <KnowledgeList
        rows={rows}
        emptyLabel="No entries in this category match these filters."
      />
    </AppShell>
  );
}
