import { createClient } from "@/lib/supabase/server";
import {
  buildParentHistoryStats,
  emptyParentHistoryStats,
  type AdminReply,
  type ChatInteraction,
  type ChatSessionRow,
  type ParentHistoryStats,
} from "@/lib/chats";

export async function loadChatSessions(): Promise<{
  sessions: ChatSessionRow[];
  unanswered: number;
  unread: number;
  error: string | null;
  email: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { sessions: [], unanswered: 0, unread: 0, error: null, email: "" };
  }

  const [{ data, error }, { count: unanswered }, { count: unread }] = await Promise.all([
    supabase
      .from("admin_session_list")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(500),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
    supabase.from("admin_session_list").select("id", { count: "exact", head: true }).eq("unread", true),
  ]);

  return {
    sessions: (data || []) as ChatSessionRow[],
    unanswered: unanswered ?? 0,
    unread: unread ?? 0,
    error: error?.message || null,
    email: user.email || "",
  };
}

export async function loadChatThread(sessionId: string): Promise<{
  messages: ChatInteraction[];
  adminReplies: AdminReply[];
  parentStats: ParentHistoryStats;
  threadError: string | null;
  session: ChatSessionRow | null;
}> {
  const supabase = await createClient();
  const [{ data: messages, error: threadError }, { data: replies }, { data: sessionRow }] =
    await Promise.all([
      supabase
        .from("interactions")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("admin_replies")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      supabase.from("admin_session_list").select("*").eq("id", sessionId).maybeSingle(),
    ]);

  const session = (sessionRow as ChatSessionRow | null) || null;
  let parentStats = emptyParentHistoryStats();
  if (session?.wa_from) {
    const waFrom = session.wa_from;
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

  return {
    messages: (messages || []) as ChatInteraction[],
    adminReplies: (replies || []) as AdminReply[],
    parentStats,
    threadError: threadError?.message || null,
    session,
  };
}
