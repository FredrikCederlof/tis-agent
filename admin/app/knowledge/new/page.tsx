import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { KnowledgeEditor } from "@/components/knowledge-editor";
import { adminNameMap } from "@/lib/chat-presentation";
import { OTHER, categoryLabel } from "@/lib/knowledge-hub";

export const dynamic = "force-dynamic";

export default async function NewKnowledgePage({
  searchParams,
}: {
  searchParams?: { from?: string; answer?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fromId = searchParams?.from?.trim() || "";
  let question = "";
  if (fromId) {
    const { data } = await supabase
      .from("interactions")
      .select("id, question")
      .eq("id", fromId)
      .maybeSingle();
    question = (data?.question || "").trim();
  }

  const [{ count }, { data: categoryRows }, { data: profiles }] = await Promise.all([
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
    supabase.from("knowledge_entries").select("category").limit(500),
    supabase.from("admin_profiles").select("email, first_name, last_name"),
  ]);

  const categories = [
    ...new Set(
      (categoryRows || [])
        .map((row) => categoryLabel((row as { category?: string | null }).category))
        .filter((name) => name && name !== OTHER),
    ),
  ];

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <KnowledgeEditor
        initialQuestion={question}
        initialAnswer={(searchParams?.answer || "").trim()}
        origin={fromId ? "inbox" : "manual"}
        originInteractionId={fromId || null}
        userEmail={user.email || ""}
        apiUrl={process.env.NEXT_PUBLIC_TINA_API_URL || ""}
        syncSecret={(process.env.ADMIN_SYNC_SECRET || "").trim()}
        backHref={fromId ? "/inbox" : "/knowledge"}
        categories={categories}
        nameByEmail={adminNameMap(profiles || [])}
      />
    </AppShell>
  );
}
