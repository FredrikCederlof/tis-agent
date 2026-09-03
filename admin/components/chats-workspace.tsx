"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  Info,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ReplyComposer } from "@/components/reply-composer";
import { WaMessage } from "@/components/wa-message";
import {
  PAGE_SIZE,
  type AdminReply,
  type ChatInteraction,
  type ChatMessage,
  type ChatSessionRow,
  type SessionFilters,
  buildTimeline,
  dayLabel,
  filterSessions,
  formatMessageTime,
  formatRelativeTime,
  pageCount,
  paginate,
  parentHue,
  parentLabel,
  replyTarget,
} from "@/lib/chats";

const OUTCOME_LABELS: Record<string, string> = {
  success: "Answered from sources",
  no_evidence: "No evidence found",
  low_confidence: "Low confidence",
  fixed_answer: "Fixed answer",
  error: "Error",
};

function ParentAvatar({ waFrom, size = 40 }: { waFrom: string; size?: number }) {
  const hue = parentHue(waFrom);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.36),
        backgroundColor: `hsl(${hue} 42% 42%)`,
      }}
      aria-hidden
    >
      P
    </span>
  );
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ChatsWorkspace({
  sessions,
  selectedId,
  messages = [],
  adminReplies = [],
  loadError,
  threadError,
}: {
  sessions: ChatSessionRow[];
  selectedId?: string;
  messages?: ChatInteraction[];
  adminReplies?: AdminReply[];
  loadError?: string | null;
  threadError?: string | null;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<SessionFilters>({
    query: "",
    read: "",
    language: "",
    outcome: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [showInfo, setShowInfo] = useState(false);

  function setFilter<K extends keyof SessionFilters>(key: K, value: SessionFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const languages = useMemo(() => {
    const found = new Set<string>();
    for (const row of sessions) {
      if (row.primary_language) found.add(row.primary_language);
    }
    return [...found].sort();
  }, [sessions]);

  const unreadTotal = useMemo(() => sessions.filter((row) => row.unread).length, [sessions]);
  const attentionTotal = useMemo(
    () => sessions.filter((row) => row.needs_attention).length,
    [sessions],
  );

  const filtered = useMemo(() => filterSessions(sessions, filters), [filters, sessions]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const pages = pageCount(filtered.length);
  const safePage = Math.min(page, pages);
  const visible = paginate(filtered, safePage);
  const selected = sessions.find((row) => row.id === selectedId) || null;
  const filtersOn = Boolean(
    filters.query || filters.read || filters.language || filters.outcome || filters.from || filters.to,
  );

  function resetFilters() {
    setFilters({ query: "", read: "", language: "", outcome: "", from: "", to: "" });
  }

  return (
    <div className="grid min-h-[78vh] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-card lg:grid-cols-[300px_1fr]">
      <aside
        className={`flex min-h-0 flex-col border-slate-100 lg:border-r ${
          selectedId ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="!pl-9"
              value={filters.query}
              onChange={(e) => setFilter("query", e.target.value)}
              placeholder="Search questions or number"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <FilterPill
              label="All"
              count={sessions.length}
              active={filters.read === ""}
              onClick={() => setFilter("read", "")}
            />
            <FilterPill
              label="Unread"
              count={unreadTotal}
              active={filters.read === "unread"}
              onClick={() => setFilter("read", "unread")}
            />
            <FilterPill
              label="Needs attention"
              count={attentionTotal}
              tone="amber"
              active={filters.read === "attention"}
              onClick={() => setFilter("read", "attention")}
            />
          </div>

          <details className="group">
            <summary className="cursor-pointer list-none text-xs font-semibold text-tis-muted hover:text-tis-navy">
              More filters {filtersOn ? "· on" : ""}
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select
                value={filters.language}
                onChange={(e) => setFilter("language", e.target.value)}
                aria-label="Language"
              >
                <option value="">All languages</option>
                {languages.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={filters.outcome}
                onChange={(e) => setFilter("outcome", e.target.value)}
                aria-label="Outcome"
              >
                <option value="">All outcomes</option>
                <option value="success">Answered</option>
                <option value="gap">Unanswered / low confidence</option>
                <option value="fixed_answer">Fixed answer</option>
                <option value="error">Error</option>
              </select>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilter("from", e.target.value)}
                aria-label="From date"
              />
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilter("to", e.target.value)}
                aria-label="To date"
              />
              <button
                type="button"
                className="secondary col-span-2 !py-2 text-xs"
                onClick={resetFilters}
                disabled={!filtersOn}
              >
                Reset filters
              </button>
            </div>
          </details>
        </div>

        {loadError ? (
          <p className="p-4 text-sm text-tis-danger">
            Could not load chats. Run <code>sql/012_chat_sessions_admin.sql</code> and{" "}
            <code>sql/013_human_reply.sql</code> in Supabase. {loadError}
          </p>
        ) : sessions.length === 0 ? (
          <p className="p-4 text-sm text-tis-muted">
            No chat sessions yet. Tina’s WhatsApp conversations appear here.
          </p>
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
                    <ParentAvatar waFrom={row.wa_from} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={`truncate text-sm text-tis-navy ${
                            row.unread ? "font-bold" : "font-semibold"
                          }`}
                        >
                          {parentLabel(row.wa_from)}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatRelativeTime(row.last_message_at)}
                        </span>
                      </div>
                      <p
                        className={`mt-0.5 truncate text-sm ${
                          row.unread ? "font-medium text-tis-ink" : "text-tis-muted"
                        }`}
                      >
                        {row.last_question || "No messages"}
                      </p>
                      {row.needs_attention && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          <AlertCircle className="h-3 w-3" />
                          Needs attention
                        </span>
                      )}
                    </div>
                    {row.unread && (
                      <span
                        className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-tis-sky"
                        aria-label="Unread"
                      />
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
            Showing {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
        )}
      </aside>

      <section
        className={`${selectedId ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col`}
      >
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-tis-muted">
            Select a session to read the parent ↔ Tina conversation.
          </div>
        ) : threadError ? (
          <div className="p-6 text-sm text-tis-danger">{threadError}</div>
        ) : !selected ? (
          <div className="p-6 text-sm text-tis-muted">This conversation is unavailable.</div>
        ) : (
          <ChatThread
            session={selected}
            interactions={messages}
            adminReplies={adminReplies}
            parentLastMessageAt={sessions
              .filter((row) => row.wa_from === selected.wa_from)
              .reduce<string | null>(
                (latest, row) =>
                  !latest || row.last_message_at > latest ? row.last_message_at : latest,
                null,
              )}
            showInfo={showInfo}
            onToggleInfo={() => setShowInfo((v) => !v)}
            onDeleted={() => router.push("/chats")}
          />
        )}
      </section>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  tone = "slate",
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: "slate" | "amber";
  onClick: () => void;
}) {
  const badgeTone =
    tone === "amber" && count > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-tis-navy";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        active
          ? "border-tis-sky bg-tis-mist text-tis-navy"
          : "border-slate-200 bg-white text-tis-muted hover:text-tis-navy"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-bold ${badgeTone}`}>{count}</span>
    </button>
  );
}

function ChatThread({
  session,
  interactions,
  adminReplies,
  parentLastMessageAt,
  showInfo,
  onToggleInfo,
  onDeleted,
}: {
  session: ChatSessionRow;
  interactions: ChatInteraction[];
  adminReplies: AdminReply[];
  parentLastMessageAt: string | null;
  showInfo: boolean;
  onToggleInfo: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const timeline = useMemo(
    () => buildTimeline(interactions, adminReplies),
    [adminReplies, interactions],
  );
  const target = useMemo(() => replyTarget(interactions), [interactions]);
  // The 24h window follows the parent's newest message, which may be in a later session.
  const lastInboundAt = useMemo(() => {
    const inSession = interactions.reduce<string | null>(
      (latest, item) => (!latest || item.created_at > latest ? item.created_at : latest),
      null,
    );
    if (!inSession) return parentLastMessageAt;
    if (!parentLastMessageAt) return inSession;
    return parentLastMessageAt > inSession ? parentLastMessageAt : inSession;
  }, [interactions, parentLastMessageAt]);

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
    <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_auto]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/chats"
              className="secondary !px-2.5 !py-1.5 text-xs lg:hidden"
              aria-label="Back to sessions"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <ParentAvatar waFrom={session.wa_from} />
            <div className="min-w-0">
              <p className="truncate font-bold text-tis-navy">{parentLabel(session.wa_from)}</p>
              <p className="truncate text-xs text-tis-muted">
                {session.message_count} question{session.message_count === 1 ? "" : "s"} ·{" "}
                {session.primary_language || "en"} · started {formatMessageTime(session.started_at)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {session.needs_attention && (
              <span className="hidden items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 sm:inline-flex">
                <AlertCircle className="h-3.5 w-3.5" />
                {session.needs_attention_count} needs attention
              </span>
            )}
            <button
              type="button"
              className="secondary !px-2.5 !py-2"
              aria-label="Session information"
              aria-pressed={showInfo}
              onClick={onToggleInfo}
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="secondary !px-2.5 !py-2"
              aria-label="Delete session"
              disabled={deleting}
              onClick={() => void onDelete()}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </header>

        {deleteError && (
          <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-tis-danger">
            Could not delete: {deleteError}
          </p>
        )}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-tis-cream/40 px-4 py-5 sm:px-6">
          {timeline.length === 0 ? (
            <p className="text-sm text-tis-muted">No messages in this session.</p>
          ) : (
            timeline.map((message, index) => (
              <div key={message.id} className="space-y-4">
                {(index === 0 || dayLabel(timeline[index - 1].at) !== dayLabel(message.at)) && (
                  <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {dayLabel(message.at)}
                  </p>
                )}
                <Bubble
                  message={message}
                  waFrom={session.wa_from}
                  menuOpen={menuId === message.id}
                  onToggleMenu={() =>
                    setMenuId((current) => (current === message.id ? null : message.id))
                  }
                />
              </div>
            ))
          )}
        </div>

        <footer className="border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
          {target ? (
            <>
              <p className="mb-2 truncate text-xs text-tis-muted">
                Replying to: <span className="font-semibold text-tis-navy">{target.question}</span>
              </p>
              <ReplyComposer
                interactionId={target.id}
                question={target.question}
                lastInboundAt={lastInboundAt}
                answeredAt={target.human_replied_at}
                answeredBy={target.human_replied_by}
                compact
              />
            </>
          ) : (
            <p className="text-xs text-tis-muted">
              No parent question in this session to reply to.
            </p>
          )}
        </footer>
      </div>

      {showInfo && (
        <InfoPanel session={session} interactions={interactions} adminReplies={adminReplies} />
      )}
    </div>
  );
}

function Bubble({
  message,
  waFrom,
  menuOpen,
  onToggleMenu,
}: {
  message: ChatMessage;
  waFrom: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  if (message.kind === "parent") {
    return (
      <div className="flex items-end gap-2">
        <ParentAvatar waFrom={waFrom} size={28} />
        <div className="max-w-[85%] sm:max-w-[70%]">
          <div className="rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-tis-ink shadow-sm">
            <WaMessage text={message.text} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
            <span>Parent · {timeOnly(message.at)}</span>
            {message.needsAttention && (
              <span className="font-semibold text-amber-700">
                {OUTCOME_LABELS[message.outcome || ""] || "Needs attention"}
              </span>
            )}
            <div className="relative">
              <button
                type="button"
                className="rounded p-0.5 hover:bg-slate-100"
                aria-label="Parent message actions"
                onClick={onToggleMenu}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute left-0 z-10 mt-1 w-52 rounded-xl border border-slate-100 bg-white py-1 shadow-card">
                  <Link
                    href={`/knowledge/new?from=${message.interactionId}`}
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
    );
  }

  if (message.kind === "admin") {
    const failed = message.status === "failed";
    return (
      <div className="flex items-end justify-end gap-2">
        <div className="max-w-[85%] text-right sm:max-w-[70%]">
          <div
            className={`rounded-2xl rounded-br-md px-3.5 py-2.5 text-left text-sm ${
              failed
                ? "border border-rose-200 bg-rose-50 text-rose-900"
                : "bg-tis-gold/90 text-tis-ink"
            }`}
          >
            <WaMessage text={message.text} />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {failed ? "Not delivered · " : ""}
            School team{message.sentBy ? ` (${message.sentBy})` : ""} · {timeOnly(message.at)}
          </p>
        </div>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tis-gold text-[11px] font-bold text-white">
          TIS
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-end justify-end gap-2">
      <div className="max-w-[85%] text-right sm:max-w-[70%]">
        <div className="rounded-2xl rounded-br-md bg-tis-navy px-3.5 py-2.5 text-left text-sm text-white">
          <WaMessage text={message.text} />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Tina · {timeOnly(message.at)}</p>
      </div>
      <Image
        src="/tina.png"
        alt="Tina"
        width={28}
        height={28}
        className="shrink-0 rounded-full object-cover ring-2 ring-tis-sky/30"
      />
    </div>
  );
}

function InfoPanel({
  session,
  interactions,
  adminReplies,
}: {
  session: ChatSessionRow;
  interactions: ChatInteraction[];
  adminReplies: AdminReply[];
}) {
  const lastQuestion = interactions[interactions.length - 1];
  const outcomes = interactions.reduce<Record<string, number>>((acc, item) => {
    acc[item.outcome] = (acc[item.outcome] || 0) + 1;
    return acc;
  }, {});

  return (
    <aside className="w-full border-t border-slate-100 bg-white p-4 lg:w-[264px] lg:border-l lg:border-t-0">
      <div className="flex flex-col items-center gap-2 border-b border-slate-100 pb-4 text-center">
        <ParentAvatar waFrom={session.wa_from} size={56} />
        <div>
          <p className="font-bold text-tis-navy">{parentLabel(session.wa_from)}</p>
          <p className="text-xs text-tis-muted">WhatsApp parent</p>
        </div>
        {lastQuestion && (
          <Link
            href={`/knowledge/new?from=${lastQuestion.id}`}
            className="secondary !px-3 !py-1.5 text-xs !no-underline"
          >
            Add last question to Hub
          </Link>
        )}
      </div>

      <Section title="Session">
        <Row label="Started" value={formatMessageTime(session.started_at)} />
        <Row label="Last activity" value={formatMessageTime(session.last_message_at)} />
        <Row label="Questions" value={String(session.message_count)} />
        <Row label="Language" value={session.primary_language || "en"} />
        <Row
          label="Needs attention"
          value={session.needs_attention ? String(session.needs_attention_count) : "None"}
        />
      </Section>

      <Section title="Outcomes">
        {Object.keys(outcomes).length === 0 ? (
          <p className="text-xs text-tis-muted">No logged answers.</p>
        ) : (
          Object.entries(outcomes).map(([outcome, count]) => (
            <Row key={outcome} label={OUTCOME_LABELS[outcome] || outcome} value={String(count)} />
          ))
        )}
      </Section>

      <Section title="Human replies">
        {adminReplies.length === 0 ? (
          <p className="text-xs text-tis-muted">No admin has replied in this session.</p>
        ) : (
          adminReplies.map((reply) => (
            <Row
              key={reply.id}
              label={`${reply.status === "failed" ? "Failed" : "Sent"} ${formatMessageTime(
                reply.created_at,
              )}`}
              value={reply.sent_by || "—"}
            />
          ))
        )}
      </Section>

      <Section title="Troubleshooting">
        <Row label="WhatsApp" value={session.wa_from} mono />
        <Row label="Session ID" value={session.id} mono />
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-tis-gold">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span
        className={`min-w-0 break-all text-right font-semibold text-tis-navy ${
          mono ? "font-mono text-[10px]" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
