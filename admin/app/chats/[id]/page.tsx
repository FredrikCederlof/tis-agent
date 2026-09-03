import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ChatsWorkspace } from "@/components/chats-workspace";
import type { AdminReply, ChatInteraction, ChatSessionRow } from "@/lib/chats";

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
    supabase
      .from("interactions")
      .select(
        "id, session_id, wa_message_id, wa_from, question, reply, language, outcome, created_at, reviewed_at, human_replied_at, human_replied_by",
      )
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
        loadError={listError?.message}
        threadError={threadError?.message}
      />
    </AppShell>
  );
}
