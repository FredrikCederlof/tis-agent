import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { KnowledgeEditor } from "@/components/knowledge-editor";

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
  const answerOverride = (searchParams?.answer || "").trim();
  let question = "";
  let suggestedAnswer = answerOverride;
  if (fromId) {
    const { data } = await supabase
      .from("interactions")
      .select("id, question, reply")
      .eq("id", fromId)
      .maybeSingle();
    question = (data?.question || "").trim();
    // Prefer an explicit answer (e.g. a human reply just sent); otherwise use Tina's reply.
    if (!suggestedAnswer) {
      suggestedAnswer = (data?.reply || "").trim();
    }
  }

  const { count } = await supabase
    .from("unanswered_interactions")
    .select("id", { count: "exact", head: true });

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <PageHeader
        title={fromId ? "Add question to Knowledge Hub" : "New Knowledge Hub entry"}
        subtitle={
          fromId
            ? "Started from a parent question in Chats. Edit and verify before Tina uses it."
            : "One verified answer becomes one RAG document. Similar phrasings stay on that document."
        }
      />
      <KnowledgeEditor
        initialQuestion={question}
        initialAnswer={suggestedAnswer}
        origin={fromId ? "inbox" : "manual"}
        originInteractionId={fromId || null}
        userEmail={user.email || ""}
        apiUrl={process.env.NEXT_PUBLIC_TINA_API_URL || ""}
        syncSecret={process.env.ADMIN_SYNC_SECRET || ""}
      />
    </AppShell>
  );
}
