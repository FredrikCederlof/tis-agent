import { NextResponse } from "next/server";
import { canAccessTinaAdmin, requireApiUser } from "@/lib/authz";
import { titleFromQuestion } from "@/lib/sandbox";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canAccessTinaAdmin(auth.profile)) {
    return NextResponse.json({ detail: "Not allowed" }, { status: 403 });
  }

  const apiUrl = (process.env.NEXT_PUBLIC_TINA_API_URL || "").replace(/\/$/, "");
  const secret = (process.env.ADMIN_SYNC_SECRET || "").trim();
  if (!apiUrl || !secret) {
    return NextResponse.json(
      {
        detail:
          "Sandbox is not configured. Set NEXT_PUBLIC_TINA_API_URL and ADMIN_SYNC_SECRET.",
      },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const question = String(payload?.question || "").trim();
  let conversationId = String(payload?.conversation_id || "").trim();
  if (!question) {
    return NextResponse.json({ detail: "question is required" }, { status: 400 });
  }

  const { supabase, user } = auth;

  // Create or verify conversation ownership (RLS also enforces user_id).
  if (conversationId) {
    const { data: existing, error } = await supabase
      .from("sandbox_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ detail: "Conversation not found" }, { status: 404 });
    }
  } else {
    const { data: created, error } = await supabase
      .from("sandbox_conversations")
      .insert({
        user_id: user.id,
        title: titleFromQuestion(question),
      })
      .select("id, title, created_at, updated_at")
      .single();
    if (error || !created) {
      return NextResponse.json(
        { detail: error?.message || "Could not create conversation" },
        { status: 500 },
      );
    }
    conversationId = created.id;
  }

  const { data: prior, error: priorError } = await supabase
    .from("sandbox_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(12);
  if (priorError) {
    return NextResponse.json({ detail: priorError.message }, { status: 500 });
  }

  const history = (prior || []).map((row) => ({
    role: row.role as string,
    content: row.content as string,
  }));

  let askResult: {
    reply?: string;
    outcome?: string;
    language?: string;
    document_titles?: string[];
    top_similarity?: number | null;
    evidence_count?: number;
    detail?: string;
  };
  try {
    const response = await fetch(`${apiUrl}/admin/sandbox/ask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, history }),
      cache: "no-store",
    });
    askResult = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { detail: askResult.detail || `Tina ask failed (${response.status})` },
        { status: response.status },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        detail: `Could not reach Tina: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      },
      { status: 502 },
    );
  }

  const reply = String(askResult.reply || "").trim();
  if (!reply) {
    return NextResponse.json({ detail: "Empty reply from Tina" }, { status: 502 });
  }

  const documentTitles = Array.isArray(askResult.document_titles)
    ? askResult.document_titles.map((t) => String(t))
    : [];

  const { data: userMsg, error: userMsgError } = await supabase
    .from("sandbox_messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: question,
    })
    .select("id, conversation_id, role, content, outcome, document_titles, created_at")
    .single();
  if (userMsgError || !userMsg) {
    return NextResponse.json(
      { detail: userMsgError?.message || "Could not save question" },
      { status: 500 },
    );
  }

  const { data: assistantMsg, error: assistantMsgError } = await supabase
    .from("sandbox_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: reply,
      outcome: askResult.outcome || null,
      document_titles: documentTitles,
    })
    .select("id, conversation_id, role, content, outcome, document_titles, created_at")
    .single();
  if (assistantMsgError || !assistantMsg) {
    return NextResponse.json(
      { detail: assistantMsgError?.message || "Could not save answer" },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();
  const { data: conversation, error: convUpdateError } = await supabase
    .from("sandbox_conversations")
    .update({
      updated_at: now,
      ...(history.length === 0 ? { title: titleFromQuestion(question) } : {}),
    })
    .eq("id", conversationId)
    .select("id, title, created_at, updated_at")
    .single();
  if (convUpdateError || !conversation) {
    return NextResponse.json(
      { detail: convUpdateError?.message || "Could not update conversation" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversation,
    user_message: userMsg,
    assistant_message: assistantMsg,
    outcome: askResult.outcome || null,
    language: askResult.language || null,
    top_similarity: askResult.top_similarity ?? null,
    evidence_count: askResult.evidence_count ?? null,
  });
}
