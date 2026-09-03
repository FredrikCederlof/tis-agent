import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ChatsWorkspace } from "@/components/chats-workspace";
import {
  buildParentHistoryStats,
  emptyParentHistoryStats,
  type AdminReply,
  type ChatInteraction,
  type ChatSessionRow,
} from "@/lib/chats";

export const dynamic = "force-dynamic";

export default async function ChatSessionPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: sessions, error: listError },
    { data: messages, error: threadError },
    { data: replies },
    { count: unanswered },
    { count: unread },
  ] = await Promise.all([
    supabase
      .from("admin_session_list")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(500),
    // "*" keeps the thread readable before newer interaction columns are applied.
    supabase
      .from("interactions")
      .select("*")
      .eq("session_id", params.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("admin_replies")
      .select("*")
      .eq("session_id", params.id)
      .order("created_at", { ascending: true }),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
    supabase
      .from("admin_session_list")
      .select("id", { count: "exact", head: true })
      .eq("unread", true),
  ]);

  const selected =
    ((sessions || []) as ChatSessionRow[]).find((row) => row.id === params.id) || null;

  let parentStats = emptyParentHistoryStats();
  if (selected?.wa_from) {
    const waFrom = selected.wa_from;
    const [
      { data: parentSessions },
      { data: parentInteractions },
      { count: humanReplyCount },
    ] = await Promise.all([
      supabase
        .from("chat_sessions")
        .select("id, started_at, last_message_at")
        .eq("wa_from", waFrom),
      supabase.from("interactions").select("id, question, outcome").eq("wa_from", waFrom),
      supabase
        .from("admin_replies")
        .select("id", { count: "exact", head: true })
        .eq("wa_from", waFrom)
        .eq("status", "sent"),
    ]);

    const interactionIds = (parentInteractions || []).map((row) => row.id as string);
    let knowledgeHubCount = 0;
    if (interactionIds.length > 0) {
      const { count } = await supabase
        .from("knowledge_entries")
        .select("id", { count: "exact", head: true })
        .in("origin_interaction_id", interactionIds)
        .eq("status", "active");
      knowledgeHubCount = count ?? 0;
    }

    parentStats = buildParentHistoryStats({
      sessions: (parentSessions || []) as { started_at: string; last_message_at: string }[],
      interactions: (parentInteractions || []) as { question: string; outcome: string }[],
      humanReplyCount: humanReplyCount ?? 0,
      knowledgeHubCount,
    });
  }

  return (
    <AppShell
      email={user.email || ""}
      unansweredCount={unanswered ?? 0}
      chatsUnreadCount={unread ?? 0}
    >
      <PageHeader
        title="Chats"
        subtitle="WhatsApp sessions with Tina. A new session starts after 10 minutes of silence."
      />
      <ChatsWorkspace
        sessions={(sessions || []) as ChatSessionRow[]}
        selectedId={params.id}
        messages={(messages || []) as ChatInteraction[]}
        adminReplies={(replies || []) as AdminReply[]}
        parentStats={parentStats}
        userEmail={user.email || ""}
        loadError={listError?.message}
        threadError={threadError?.message}
      />
    </AppShell>
  );
}
