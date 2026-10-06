import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { KnowledgeList } from "@/components/knowledge-list";
import {
  UNCATEGORIZED,
  categoryFromSlug,
  categoryLabel,
  categoryPageSubtitle,
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

  const articleCount = rows.length;
  const articleLabel = `${articleCount} ${articleCount === 1 ? "article" : "articles"}`;

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <div className="pb-10">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title">
              {title}{" "}
              <span className="align-middle text-base font-medium tracking-normal text-tis-muted sm:text-lg">
                {articleLabel}
              </span>
            </h1>
            <p className="page-subtitle">{categoryPageSubtitle(title)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/knowledge" className="secondary">
              All categories
            </Link>
            <Link href="/knowledge/new" className="primary">
              <Plus className="h-4 w-4" aria-hidden />
              New article
            </Link>
          </div>
        </div>
        <KnowledgeList
          rows={rows}
          emptyLabel="No entries in this category match these filters."
          apiUrl={process.env.NEXT_PUBLIC_TINA_API_URL || ""}
          syncSecret={(process.env.ADMIN_SYNC_SECRET || "").trim()}
        />
      </div>
    </AppShell>
  );
}
