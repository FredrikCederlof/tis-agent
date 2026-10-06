import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { KnowledgeEditor } from "@/components/knowledge-editor";
import { adminNameMap } from "@/lib/chat-presentation";
import { knowledgeEditorBackHref } from "@/lib/knowledge-hub";
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

  const [{ data, error }, { count }, { data: allRows }, { data: profiles }] = await Promise.all([
    supabase.from("knowledge_entries").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
    supabase.from("knowledge_entries").select("*").limit(500),
    supabase.from("admin_profiles").select("email, first_name, last_name"),
  ]);

  if (error || !data) {
    notFound();
  }

  const entry = data as KnowledgeEntry;
  const rows = (allRows || []) as KnowledgeEntry[];
  const categories = [
    ...new Set(rows.map((row) => row.category).filter((value): value is string => Boolean(value))),
  ];

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <KnowledgeEditor
        entry={entry}
        origin={entry.origin}
        originInteractionId={entry.origin_interaction_id}
        userEmail={user.email || ""}
        apiUrl={process.env.NEXT_PUBLIC_TINA_API_URL || ""}
        syncSecret={(process.env.ADMIN_SYNC_SECRET || "").trim()}
        backHref={knowledgeEditorBackHref(entry.category, rows)}
        categories={categories}
        nameByEmail={adminNameMap(profiles || [])}
      />
    </AppShell>
  );
}
