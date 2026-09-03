"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  PAGE_SIZE,
  type ChatInteraction,
  type ChatSessionRow,
  filterSessions,
  formatMessageTime,
  formatRelativeTime,
  pageCount,
  paginate,
  parentHue,
  parentLabel,
} from "@/lib/chats";

function ParentAvatar({ waFrom, size = 36 }: { waFrom: string; size?: number }) {
  const hue = parentHue(waFrom);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue} 42% 42%)`,
      }}
      aria-hidden
    >
      P
    </span>
  );
}

export function ChatsWorkspace({
  sessions,
  selectedId,
  messages,
  loadError,
  threadError,
}: {
  sessions: ChatSessionRow[];
  selectedId?: string;
  messages?: ChatInteraction[];
  loadError?: string | null;
  threadError?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [read, setRead] = useState<"" | "unread" | "read">("");
  const [language, setLanguage] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const languages = useMemo(() => {
    const found = new Set<string>();
    for (const row of sessions) {
      if (row.primary_language) found.add(row.primary_language);
    }
    return [...found].sort();
  }, [sessions]);

  const filtered = useMemo(
    () => filterSessions(sessions, { query, read, language, outcome, from, to }),
    [from, language, outcome, query, read, sessions, to],
  );

  useEffect(() => {
    setPage(1);
  }, [query, read, language, outcome, from, to]);

  const pages = pageCount(filtered.length);
  const safePage = Math.min(page, pages);
  const visible = paginate(filtered, safePage);
  const selected = sessions.find((row) => row.id === selectedId) || null;

  function resetFilters() {
    setQuery("");
    setRead("");
    setLanguage("");
    setOutcome("");
    setFrom("");
    setTo("");
  }

  const filtersOn = Boolean(query || read || language || outcome || from || to);

  return (
    <div className="grid min-h-[70vh] overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-card lg:grid-cols-[320px_1fr]">
      <aside className={`flex flex-col border-slate-100 lg:border-r ${selectedId ? "hidden lg:flex" : "flex"}`}>
        <div className="space-y-3 border-b border-slate-100 p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions or parent…"
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={read} onChange={(e) => setRead(e.target.value as "" | "unread" | "read")}>
              <option value="">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">All languages</option>
              {languages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">All outcomes</option>
              <option value="success">Answered</option>
              <option value="gap">Unanswered / low confidence</option>
              <option value="fixed_answer">Fixed answer</option>
              <option value="error">Error</option>
            </select>
            <button type="button" className="secondary !px-3 !py-2 text-xs" onClick={resetFilters} disabled={!filtersOn}>
              Reset
            </button>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
        </div>

        {loadError ? (
          <p className="p-4 text-sm text-tis-danger">
            Could not load chats. Run <code>sql/012_chat_sessions_admin.sql</code> in Supabase.{" "}
            {loadError}
          </p>
        ) : sessions.length === 0 ? (
          <p className="p-4 text-sm text-tis-muted">No chat sessions yet. Tina’s WhatsApp conversations will appear here.</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-tis-muted">No sessions match these filters.</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((row) => {
              const active = row.id === selectedId;
              return (
                <li key={row.id}>
                  <Link
                    href={`/chats/${row.id}`}
                    className={`flex gap-3 border-b border-slate-50 px-4 py-3 transition hover:bg-tis-mist/70 ${
                      active ? "bg-tis-mist" : ""
                    }`}
                  >
                    <ParentAvatar waFrom={row.wa_from} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${row.unread ? "font-bold text-tis-navy" : "font-semibold text-tis-navy"}`}>
                          {parentLabel(row.wa_from)}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatRelativeTime(row.last_message_at)}
                        </span>
                      </div>
                      <p className={`mt-0.5 truncate text-sm ${row.unread ? "font-medium text-tis-ink" : "text-tis-muted"}`}>
                        {row.last_question || "No messages"}
                      </p>
                    </div>
                    {row.unread && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-tis-sky" aria-label="Unread" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs">
            <button
              type="button"
              className="secondary !px-3 !py-1.5"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="font-semibold text-tis-navy">
              {safePage} / {pages}
            </span>
            <button
              type="button"
              className="secondary !px-3 !py-1.5"
              disabled={safePage >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
        {filtered.length > 0 && (
          <p className="border-t border-slate-50 px-4 py-2 text-[11px] text-slate-400">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </p>
        )}
      </aside>

      <section className={`${selectedId ? "flex" : "hidden lg:flex"} min-h-[70vh] flex-col`}>
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-tis-muted">
            Select a session to read the parent ↔ Tina conversation.
          </div>
        ) : threadError ? (
          <div className="p-6 text-sm text-tis-danger">{threadError}</div>
        ) : !selected ? (
          <div className="p-6 text-sm text-tis-muted">This conversation is unavailable.</div>
        ) : (
          <ChatThread session={selected} messages={messages || []} onDeleted={() => router.push("/chats")} />
        )}
      </section>
    </div>
  );
}

function ChatThread({
  session,
  messages,
  onDeleted,
}: {
  session: ChatSessionRow;
  messages: ChatInteraction[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!session.unread) return;
    const supabase = createClient();
    void supabase
      .from("chat_sessions")
      .update({ admin_read_at: new Date().toISOString() })
      .eq("id", session.id)
      .then(() => router.refresh());
  }, [router, session.id, session.unread]);

  async function onDelete() {
    if (
      !window.confirm(
        "Delete chat session?\nThis will permanently remove this session from Tina Admin.",
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const supabase = createClient();
    const { error } = await supabase.from("chat_sessions").delete().eq("id", session.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    onDeleted();
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/chats" className="secondary !px-3 !py-1.5 text-xs lg:hidden">
              Back
            </Link>
            <ParentAvatar waFrom={session.wa_from} />
            <div className="min-w-0">
              <p className="font-semibold text-tis-navy">{parentLabel(session.wa_from)}</p>
              <p className="truncate text-xs text-tis-muted">
                {session.message_count} messages · {session.primary_language || "en"} · started{" "}
                {formatMessageTime(session.started_at)}
              </p>
            </div>
          </div>
          <button type="button" className="secondary !px-3 !py-1.5 text-xs" disabled={deleting} onClick={() => void onDelete()}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
        <dl className="mt-3 grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
          <div>
            <dt className="inline font-semibold text-slate-600">Last activity: </dt>
            <dd className="inline">{formatMessageTime(session.last_message_at)}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-600">WhatsApp: </dt>
            <dd className="inline font-mono">{session.wa_from}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="inline font-semibold text-slate-600">Session ID: </dt>
            <dd className="inline font-mono">{session.id}</dd>
          </div>
        </dl>
        {deleteError && <p className="mt-2 text-sm text-tis-danger">Could not delete: {deleteError}</p>}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 ? (
          <p className="text-sm text-tis-muted">No messages in this session.</p>
        ) : (
          messages.map((item) => (
            <div key={item.id} className="space-y-3">
              <div className="flex items-end gap-2">
                <ParentAvatar waFrom={item.wa_from || session.wa_from} size={28} />
                <div className="max-w-[80%]">
                  <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm text-tis-ink">
                    {item.question}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                    <span>Parent · {formatMessageTime(item.created_at)}</span>
                    <div className="relative">
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-slate-100"
                        aria-label="Parent message actions"
                        onClick={() => setMenuId((current) => (current === item.id ? null : item.id))}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                      {menuId === item.id && (
                        <div className="absolute left-0 z-10 mt-1 w-52 rounded-xl border border-slate-100 bg-white py-1 shadow-card">
                          <Link
                            href={`/knowledge/new?from=${item.id}`}
                            className="block px-3 py-2 text-sm font-semibold text-tis-navy hover:bg-tis-mist"
                          >
                            Add to Knowledge Hub
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {item.reply && (
                <div className="flex items-end justify-end gap-2">
                  <div className="max-w-[80%] text-right">
                    <div className="rounded-2xl rounded-br-md bg-tis-navy px-3.5 py-2.5 text-left text-sm text-white">
                      {item.reply}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">Tina · {formatMessageTime(item.created_at)}</p>
                  </div>
                  <Image
                    src="/tina.png"
                    alt="Tina"
                    width={28}
                    height={28}
                    className="rounded-full object-cover ring-2 ring-tis-sky/30"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <footer className="border-t border-slate-100 px-4 py-3 text-xs text-tis-muted">
        Replies from Admin are not available yet. Identifiers are kept so a later Reply to parent can use this session.
      </footer>
    </div>
  );
}
