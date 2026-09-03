import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ChatsWorkspace } from "@/components/chats-workspace";
import type { ChatSessionRow } from "@/lib/chats";

export const dynamic = "force-dynamic";

export default async function ChatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data, error }, { count: unanswered }, { count: unread }] = await Promise.all([
    supabase
      .from("admin_session_list")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(500),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
    supabase.from("admin_session_list").select("id", { count: "exact", head: true }).eq("unread", true),
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
        sessions={(data || []) as ChatSessionRow[]}
        userEmail={user.email || ""}
        loadError={error?.message}
      />
    </AppShell>
  );
}
