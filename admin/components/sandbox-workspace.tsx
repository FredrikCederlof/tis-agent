"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  MessageSquarePlus,
  Send,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OutcomeBadge } from "@/components/outcome-badge";
import { SourceChip } from "@/components/source-chip";
import { WaMessage } from "@/components/wa-message";
import { sourceTitles, stripSourceLines } from "@/lib/chat-presentation";
import {
  currentTokyoMonthKey,
  groupConversationsByMonth,
  type SandboxConversation,
  type SandboxMessage,
} from "@/lib/sandbox";

type UserIdentity = {
  name: string;
  initial: string;
  avatarUrl: string | null;
};

export function SandboxWorkspace({ user }: { user: UserIdentity }) {
  const [conversations, setConversations] = useState<SandboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SandboxMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentMonth = currentTokyoMonthKey();

  const folders = useMemo(
    () => groupConversationsByMonth(conversations),
    [conversations],
  );

  useEffect(() => {
    void refreshConversations();
  }, []);

  useEffect(() => {
    setOpenMonths((prev) => {
      const next = { ...prev };
      for (const folder of folders) {
        if (next[folder.key] === undefined) {
          // Expand month folders by default so chats are visible immediately.
          next[folder.key] = true;
        }
      }
      return next;
    });
  }, [folders, currentMonth]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function refreshConversations() {
    setLoadingList(true);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("sandbox_conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });
    setLoadingList(false);
    if (err) {
      setError(err.message);
      return;
    }
    setConversations((data || []) as SandboxConversation[]);
  }

  async function loadMessages(conversationId: string) {
    setLoadingThread(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("sandbox_messages")
      .select("id, conversation_id, role, content, outcome, document_titles, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setLoadingThread(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessages((data || []) as SandboxMessage[]);
  }

  function startNewChat() {
    setSelectedId(null);
    setMessages([]);
    setDraft("");
    setError(null);
  }

  async function deleteConversation(id: string) {
    if (!window.confirm("Delete this sandbox chat?")) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("sandbox_conversations").delete().eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setConversations((rows) => rows.filter((row) => row.id !== id));
    if (selectedId === id) startNewChat();
  }

  async function sendQuestion() {
    const question = draft.trim();
    if (!question || sending) return;
    const optimisticId = `local-${Date.now()}`;
    const optimistic: SandboxMessage = {
      id: optimisticId,
      conversation_id: selectedId || "pending",
      role: "user",
      content: question,
      outcome: null,
      document_titles: [],
      created_at: new Date().toISOString(),
    };
    setDraft("");
    setSending(true);
    setError(null);
    setMessages((rows) => [...rows, optimistic]);
    try {
      const response = await fetch("/api/sandbox/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          conversation_id: selectedId || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || `Ask failed (${response.status})`);
      }
      const conversation = result.conversation as SandboxConversation;
      const userMessage = result.user_message as SandboxMessage;
      const assistantMessage = result.assistant_message as SandboxMessage;
      setSelectedId(conversation.id);
      setConversations((rows) => {
        const others = rows.filter((row) => row.id !== conversation.id);
        return [conversation, ...others];
      });
      setMessages((rows) => {
        const withoutOptimistic = rows.filter((m) => m.id !== optimisticId);
        if (withoutOptimistic.some((m) => m.id === userMessage.id)) {
          return [...withoutOptimistic, assistantMessage];
        }
        return [...withoutOptimistic, userMessage, assistantMessage];
      });
      setOpenMonths((prev) => ({ ...prev, [currentMonth]: true }));
    } catch (err) {
      setMessages((rows) => rows.filter((m) => m.id !== optimisticId));
      setDraft(question);
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setSending(false);
    }
  }

  const showEmpty = !loadingThread && messages.length === 0 && !sending;

  return (
    <div className="grid h-full min-h-0 flex-1 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-card lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-slate-100 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-100 p-3">
          <button
            type="button"
            className="primary w-full justify-center !text-[13px]"
            onClick={startNewChat}
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden />
            New chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loadingList ? (
            <p className="px-2 py-4 text-xs text-tis-muted">Loading chats…</p>
          ) : folders.length === 0 ? (
            <p className="px-2 py-4 text-xs text-tis-muted">
              No sandbox chats yet. Ask Tina something to start.
            </p>
          ) : (
            <ul className="space-y-1">
              {folders.map((folder) => {
                const open = openMonths[folder.key] ?? folder.key === currentMonth;
                return (
                  <li key={folder.key}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] font-bold text-tis-navy hover:bg-tis-mist"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenMonths((prev) => ({ ...prev, [folder.key]: !open }))
                      }
                    >
                      <Folder className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                      <span className="text-[10px] font-bold tabular-nums text-slate-400">
                        {folder.conversations.length}
                      </span>
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      )}
                    </button>
                    {open ? (
                      <ul className="mb-1 ml-2 space-y-0.5 border-l border-slate-100 pl-2">
                        {folder.conversations.map((row) => {
                          const active = row.id === selectedId;
                          return (
                            <li key={row.id} className="group flex items-center gap-1">
                              <button
                                type="button"
                                className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[12px] ${
                                  active
                                    ? "bg-tis-mist font-semibold text-tis-navy"
                                    : "text-tis-ink hover:bg-slate-50"
                                }`}
                                onClick={() => setSelectedId(row.id)}
                              >
                                {row.title || "Untitled"}
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-tis-danger group-hover:opacity-100"
                                aria-label={`Delete ${row.title}`}
                                onClick={() => void deleteConversation(row.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <p className="truncate text-sm font-bold text-tis-navy">
            {selectedId
              ? conversations.find((c) => c.id === selectedId)?.title || "Sandbox chat"
              : "New sandbox chat"}
          </p>
          <p className="mt-0.5 text-xs text-tis-muted">
            Same Tina knowledge as WhatsApp — answers are not sent to parents.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-tis-cream/60 px-4 py-5 sm:px-6">
          {loadingThread ? (
            <p className="text-sm text-tis-muted">Loading messages…</p>
          ) : showEmpty ? (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
              <Image
                src="/tina.png"
                alt="Tina"
                width={72}
                height={72}
                className="rounded-full object-cover ring-2 ring-tis-navy/20"
              />
              <p className="mt-4 text-sm font-bold text-tis-navy">Ask Tina anything school-related</p>
              <p className="mt-1 max-w-sm text-xs text-tis-muted">
                Try handbook, calendar, bus, or policy questions. Your chats stay private to your
                account.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <SandboxBubble key={message.id} message={message} user={user} />
              ))}
              {sending ? <TinaTypingIndicator /> : null}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <footer className="border-t border-slate-100 bg-white p-3 sm:p-4">
          {error ? (
            <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>
          ) : null}
          <div className="relative rounded-2xl border border-black/[0.08] bg-white shadow-sm focus-within:border-tis-navy focus-within:ring-4 focus-within:ring-black/10">
            <textarea
              rows={2}
              className="!min-h-[4.5rem] w-full resize-none !rounded-2xl !border-0 !bg-transparent !pr-16 !shadow-none focus:!ring-0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuestion();
                }
              }}
              placeholder="Ask Tina…"
              aria-label="Ask Tina"
              disabled={sending}
            />
            <button
              type="button"
              className="primary absolute bottom-2.5 right-2.5 !h-9 !min-h-0 !rounded-xl !px-3"
              disabled={sending || !draft.trim()}
              onClick={() => void sendQuestion()}
              aria-label="Ask"
            >
              <Send className="h-4 w-4" aria-hidden />
              {sending ? "…" : "Ask"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-tis-muted">
            Press Enter to send · Shift+Enter for a new line
          </p>
        </footer>
      </section>
    </div>
  );
}

function UserAvatar({ user, size = 32 }: { user: UserIdentity; size?: number }) {
  if (user.avatarUrl) {
    return (
      <Image
        src={user.avatarUrl}
        alt={user.name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover ring-1 ring-slate-200"
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-tis-mist text-[11px] font-bold text-tis-navy ring-1 ring-slate-200"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {user.initial}
    </span>
  );
}

function TinaTypingIndicator() {
  return (
    <div className="flex items-end gap-2" aria-live="polite" aria-label="Tina is typing">
      <Image
        src="/tina.png"
        alt=""
        width={28}
        height={28}
        className="mb-0.5 shrink-0 rounded-full object-cover ring-1 ring-tis-ink"
      />
      {/* Compact WhatsApp-scale typing bubble (~32×22). */}
      <div className="rounded-full bg-tis-navy px-2 py-1 shadow-sm">
        <div className="flex h-3 items-center gap-[2px]">
          <span className="wa-typing-dot h-1 w-1 rounded-full bg-white/90" />
          <span className="wa-typing-dot h-1 w-1 rounded-full bg-white/90" />
          <span className="wa-typing-dot h-1 w-1 rounded-full bg-white/90" />
        </div>
      </div>
    </div>
  );
}

function CopyAnswerButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback for older browsers / denied clipboard.
      window.prompt("Copy Tina’s answer:", text);
    }
  }

  return (
    <button
      type="button"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition hover:bg-white/25"
      aria-label={copied ? "Copied" : "Copy answer"}
      title={copied ? "Copied" : "Copy answer"}
      onClick={() => void onCopy()}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

function SandboxBubble({
  message,
  user,
}: {
  message: SandboxMessage;
  user: UserIdentity;
}) {
  if (message.role === "user") {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <div className="min-w-0 max-w-[85%] sm:max-w-[68%]">
          <div className="mb-1 flex flex-wrap items-center justify-end gap-2">
            <span className="text-[13px] font-bold text-tis-navy">{user.name}</span>
          </div>
          <div className="rounded-2xl rounded-tr-md border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-tis-ink shadow-sm">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
        <UserAvatar user={user} size={32} />
      </div>
    );
  }

  const { body } = stripSourceLines(message.content);
  const sources = sourceTitles(message.document_titles, message.content);

  return (
    <div className="flex items-start gap-2.5">
      <Image
        src="/tina.png"
        alt="Tina"
        width={32}
        height={32}
        className="shrink-0 rounded-full object-cover ring-1 ring-tis-ink"
      />
      <div className="min-w-0 max-w-[85%] sm:max-w-[68%]">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-tis-navy">Tina</span>
          {message.outcome ? <OutcomeBadge outcome={message.outcome} size="sm" /> : null}
        </div>
        <div className="rounded-2xl rounded-tl-md bg-tis-navy px-3.5 py-2.5 text-sm text-white shadow-sm">
          <WaMessage text={body} />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {sources.titles.length > 0 ? (
              <div className="min-w-0 [&>div]:!mt-0">
                <SourceChip titles={sources.titles} quote={sources.quote} />
              </div>
            ) : null}
            <CopyAnswerButton text={message.content} />
          </div>
        </div>
      </div>
    </div>
  );
}
