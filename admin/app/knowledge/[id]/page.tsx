import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { KnowledgeEditor } from "@/components/knowledge-editor";
import type { KnowledgeEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditKnowledgePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data, error }, { count }] = await Promise.all([
    supabase.from("knowledge_entries").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
  ]);

  if (error || !data) {
    notFound();
  }

  const entry = data as KnowledgeEntry;

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <PageHeader
        title="Edit Knowledge Hub entry"
        subtitle="Saving updates the same RAG document. Archive removes it from Tina’s retrieval."
      />
      <KnowledgeEditor
        entry={entry}
        origin={entry.origin}
        originInteractionId={entry.origin_interaction_id}
        userEmail={user.email || ""}
        apiUrl={process.env.NEXT_PUBLIC_TINA_API_URL || ""}
        syncSecret={process.env.ADMIN_SYNC_SECRET || ""}
      />
    </AppShell>
  );
}
