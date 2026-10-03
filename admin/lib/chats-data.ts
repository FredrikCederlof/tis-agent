import { createClient } from "@/lib/supabase/server";
import { avatarPublicUrl } from "@/lib/account";
import { adminAvatarMap, adminNameMap } from "@/lib/chat-presentation";
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
  adminNames: Record<string, string>;
  adminAvatars: Record<string, string>;
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

  const adminReplies = (replies || []) as AdminReply[];
  const senderEmailsRaw = adminReplies
    .map((reply) => (reply.sent_by || "").trim())
    .filter(Boolean);
  const senderEmails = [
    ...new Set([
      ...senderEmailsRaw,
      ...senderEmailsRaw.map((email) => email.toLowerCase()),
    ]),
  ];
  let adminNames: Record<string, string> = {};
  let adminAvatars: Record<string, string> = {};
  if (senderEmails.length > 0) {
    const { data: profiles } = await supabase
      .from("admin_profiles")
      .select("email, first_name, last_name, avatar_path")
      .in("email", senderEmails);
    adminNames = adminNameMap(profiles || []);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    adminAvatars = adminAvatarMap(profiles || [], supabaseUrl, avatarPublicUrl);
  }

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
    adminReplies,
    adminNames,
    adminAvatars,
    parentStats,
    threadError: threadError?.message || null,
    session,
  };
}
