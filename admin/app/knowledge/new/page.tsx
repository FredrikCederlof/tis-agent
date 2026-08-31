import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { KnowledgeEditor } from "@/components/knowledge-editor";

export const dynamic = "force-dynamic";

export default async function NewKnowledgePage({
  searchParams,
}: {
  searchParams?: { from?: string };
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

  const { count } = await supabase
    .from("unanswered_interactions")
    .select("id", { count: "exact", head: true });

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <PageHeader
        title={fromId ? "Add inbox question to Knowledge Hub" : "New Knowledge Hub entry"}
        subtitle="One verified answer becomes one RAG document. Similar phrasings stay on that document."
      />
      <KnowledgeEditor
        initialQuestion={question}
        origin={fromId ? "inbox" : "manual"}
        originInteractionId={fromId || null}
        userEmail={user.email || ""}
        apiUrl={process.env.NEXT_PUBLIC_TINA_API_URL || ""}
        syncSecret={process.env.ADMIN_SYNC_SECRET || ""}
      />
    </AppShell>
  );
}
