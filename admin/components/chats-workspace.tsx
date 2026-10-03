"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  PanelRight,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AttentionBadge, AttentionStatusCard } from "@/components/attention-badge";
import { AdminEnglishText, useAdminEnglishMap } from "@/components/admin-english-text";
import { LanguageBadge } from "@/components/language-badge";
import { OutcomeBadge, OutcomeSummaryList } from "@/components/outcome-badge";
import { ParentAvatar } from "@/components/parent-avatar";
import { ReplyComposer, ReplyWindowBadge } from "@/components/reply-composer";
import { SourceChip } from "@/components/source-chip";
import { WaMessage } from "@/components/wa-message";
import {
  adminDisplayName,
  isKnowledgeCandidateQuestion,
  knowledgeHubUrl,
  sourceTitles,
  stripSourceLines,
} from "@/lib/chat-presentation";
import {
  PAGE_SIZE,
  type AdminReply,
  type ChatInteraction,
  type ChatMessage,
  type ChatSessionRow,
  type ParentHistoryStats,
  type SessionFilters,
  buildTimeline,
  dayLabel,
  emptyParentHistoryStats,
  filterSessions,
  formatMessageTime,
  formatRelativeTime,
  pageCount,
  paginate,
  parentLabel,
  questionCountBadge,
  replyTarget,
} from "@/lib/chats";
import { useUiTheme } from "@/components/theme-provider";
import { isLimeLicorice } from "@/lib/themes";

const iconButtonClass = (active?: boolean, lime?: boolean) =>
  `inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:opacity-50 ${
    lime
      ? active
        ? "border-tina-border bg-tina-subtle text-tina-text"
        : "border-tina-border bg-white text-tina-muted hover:bg-tina-subtle hover:text-tina-text"
      : active
        ? "border-tis-navy bg-tis-mist text-tis-navy"
        : "border-black/[0.08] bg-white text-tis-muted hover:bg-tis-mist hover:text-tis-navy"
  }`;

function IconButton({
  label,
  onClick,
  href,
  active,
  disabled,
  children,
  lime = false,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  lime?: boolean;
}) {
  if (href && !disabled) {
    return (
      <Link
        href={href}
        aria-label={label}
        title={label}
        className={iconButtonClass(active, lime)}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={iconButtonClass(active, lime)}
    >
      {children}
    </button>
  );
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ChatsWorkspace({
  sessions,
  selectedId,
  userEmail = "",
  loadError,
  children,
}: {
  sessions: ChatSessionRow[];
  selectedId?: string;
  userEmail?: string;
  loadError?: string | null;
  /** Detail pane — kept stable across conversation switches via chats layout. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const lime = isLimeLicorice(useUiTheme());
  const [filters, setFilters] = useState<SessionFilters>({
    query: "",
    read: "",
    language: "",
    outcome: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

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
  const resolvedTotal = useMemo(
    () => sessions.filter((row) => !row.needs_attention).length,
    [sessions],
  );

  const filtered = useMemo(() => filterSessions(sessions, filters), [filters, sessions]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const pages = pageCount(filtered.length);
  const safePage = Math.min(page, pages);
  const visible = paginate(filtered, safePage);
  const previewTexts = useMemo(
    () => visible.map((row) => row.last_question || "").filter(Boolean),
    [visible],
  );
  const previewLanguages = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const row of visible) {
      if (row.last_question) map[row.last_question] = row.primary_language;
    }
    return map;
  }, [visible]);
  const previewStored = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const row of visible) {
      if (row.last_question && row.last_question_en) {
        map[row.last_question] = row.last_question_en;
      }
    }
    return map;
  }, [visible]);
  const englishPreviews = useAdminEnglishMap(previewTexts, previewLanguages, previewStored);
  const advancedOn = Boolean(filters.language || filters.outcome || filters.from || filters.to);

  function resetFilters() {
    setFilters({ query: "", read: "", language: "", outcome: "", from: "", to: "" });
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((item) => item !== id);
    });
  }

  async function deleteSelected() {
    if (!selectedIds.length) return;
    if (
      !window.confirm(
        `Delete ${selectedIds.length} conversation${selectedIds.length === 1 ? "" : "s"}?\nThis permanently removes them from Nabo.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    setBulkError(null);
    const supabase = createClient();
    const { error } = await supabase.from("chat_sessions").delete().in("id", selectedIds);
    setBulkDeleting(false);
    if (error) {
      setBulkError(error.message);
      return;
    }
    const removedOpen = selectedId ? selectedIds.includes(selectedId) : false;
    setSelectedIds([]);
    if (removedOpen) router.push("/chats");
    else router.refresh();
  }

  return (
    <div
      className={`grid h-full min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] ${
        lime
          ? "gap-2.5 bg-transparent"
          : "rounded-2xl border border-black/[0.06] bg-white shadow-card"
      }`}
    >
      <aside
        className={`flex min-h-0 flex-col ${
          lime
            ? "rounded-pane border border-tina-border bg-white"
            : "border-slate-100 bg-slate-50 lg:border-r"
        } ${selectedId ? "hidden lg:flex" : "flex"}`}
      >
        <div className="space-y-3 p-4">
          {lime ? (
            <div>
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-tina-text">
                Chats
              </h1>
              <p className="mt-1 text-sm text-tina-muted">
                WhatsApp sessions with Tina. A new session starts after 10 minutes of silence.
              </p>
            </div>
          ) : null}
          <div className="relative flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                className={
                  lime
                    ? "!rounded-xl !border-transparent !bg-tina-subtle !pl-9 !shadow-none focus:!ring-black/10"
                    : "!rounded-2xl !bg-slate-50 !pl-9"
                }
                value={filters.query}
                onChange={(e) => setFilter("query", e.target.value)}
                placeholder={lime ? "Search conversations..." : "Search"}
              />
            </div>
            {lime ? (
              <button
                type="button"
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                  advancedOn || showFilters
                    ? "bg-tina-active text-white"
                    : "bg-tina-subtle text-tina-secondary hover:text-tina-text"
                }`}
                aria-label="Filters"
                aria-expanded={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div
            className={
              lime
                ? "flex flex-nowrap items-center gap-1.5 overflow-x-auto"
                : "flex items-center gap-1.5 rounded-2xl bg-slate-100 p-1"
            }
          >
            <SegmentButton
              label="All"
              count={sessions.length}
              active={filters.read === ""}
              lime={lime}
              onClick={() => setFilter("read", "")}
            />
            <SegmentButton
              label="Unread"
              count={unreadTotal}
              active={filters.read === "unread"}
              lime={lime}
              onClick={() => setFilter("read", "unread")}
            />
            <SegmentButton
              label={lime ? "Needs attention" : "Attention"}
              count={attentionTotal}
              tone="amber"
              active={filters.read === "attention"}
              lime={lime}
              onClick={() => setFilter("read", "attention")}
            />
            {lime ? (
              <SegmentButton
                label="Resolved"
                count={resolvedTotal}
                active={filters.read === "resolved"}
                lime={lime}
                onClick={() => setFilter("read", "resolved")}
              />
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <p
              className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
                lime ? "text-tina-muted" : "text-slate-400"
              }`}
            >
              Conversations
            </p>
            {lime ? null : (
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                  advancedOn || showFilters
                    ? "bg-tis-mist text-tis-navy"
                    : "text-tis-muted hover:bg-slate-50 hover:text-tis-navy"
                }`}
                aria-expanded={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters{advancedOn ? " · on" : ""}
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-2.5">
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
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        {loadError ? (
          <p className="px-4 pb-4 text-sm text-tis-danger">
            Could not load chats. Run <code>sql/012_chat_sessions_admin.sql</code> and{" "}
            <code>sql/013_human_reply.sql</code> in Supabase. {loadError}
          </p>
        ) : sessions.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-tis-muted">
            No chat sessions yet. Tina’s WhatsApp conversations appear here.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-tis-muted">No sessions match these filters.</p>
        ) : (
          <ul className={`min-h-0 flex-1 overflow-y-auto px-3 pb-2 ${lime ? "space-y-1" : "space-y-2"}`}>
            {visible.map((row) => {
              const active = row.id === selectedId;
              const questions = questionCountBadge(row.message_count);
              const checked = selectedIds.includes(row.id);
              return (
                <li key={row.id}>
                  <div
                    className={`flex items-start gap-1 transition ${
                      lime
                        ? `rounded-2xl ${
                            active
                              ? "bg-tina-subtle"
                              : row.needs_attention
                                ? "bg-amber-50/60 hover:bg-amber-50"
                                : "hover:bg-tina-subtle/70"
                          }`
                        : `rounded-2xl border shadow-sm ${
                            row.needs_attention && !active
                              ? "border-amber-200/80 bg-amber-50/50 hover:bg-amber-50/70"
                              : active
                                ? "border-tis-navy/20 bg-tis-mist"
                                : "border-black/[0.06] bg-white hover:bg-white"
                          } ${row.needs_attention && active ? "ring-1 ring-amber-300/70" : ""}`
                    }`}
                  >
                    <label
                      className="flex cursor-pointer items-start px-2.5 pt-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="sr-only">Select conversation</span>
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        checked={checked}
                        onChange={(e) => toggleSelected(row.id, e.target.checked)}
                      />
                    </label>
                    <Link
                      href={`/chats/${row.id}`}
                      className="relative flex min-w-0 flex-1 items-start gap-3 py-3 pr-3"
                    >
                      {row.unread && !lime && (
                        <span
                          className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rounded-full bg-tis-unread"
                          aria-label="Unread"
                        />
                      )}
                      <ParentAvatar waFrom={row.wa_from} size={lime ? 44 : 40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={`truncate text-sm ${
                              lime ? "text-tina-text" : "text-tis-navy"
                            } ${row.unread ? "font-bold" : "font-semibold"}`}
                          >
                            {parentLabel(row.wa_from)}
                          </p>
                          <span
                            className={`shrink-0 text-[11px] ${
                              lime ? "text-tina-muted" : "text-slate-400"
                            }`}
                          >
                            {formatRelativeTime(row.last_message_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p
                            className={`min-w-0 flex-1 truncate text-[13px] ${
                              row.unread
                                ? lime
                                  ? "font-medium text-tina-text"
                                  : "font-medium text-tis-ink"
                                : lime
                                  ? "text-tina-muted"
                                  : "text-tis-muted"
                            }`}
                          >
                            {row.last_question
                              ? englishPreviews[row.last_question] || row.last_question
                              : "No messages"}
                          </p>
                          {questions != null ? (
                            <span
                              className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                                lime
                                  ? "bg-tis-lime text-tis-on-lime"
                                  : "bg-tis-unread text-white"
                              }`}
                            >
                              {questions}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {lime ? null : (
                            <LanguageBadge language={row.primary_language} size="sm" />
                          )}
                          {row.needs_attention ? (
                            lime ? (
                              <span className="inline-flex h-2 w-2 rounded-full bg-tis-danger" aria-label="Needs attention" />
                            ) : (
                              <AttentionBadge count={row.needs_attention_count} size="sm" />
                            )
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs font-semibold text-tis-navy">
              {selectedIds.length} selected
            </p>
            <button
              type="button"
              className="secondary !px-3 !py-1.5 text-xs text-tis-danger"
              disabled={bulkDeleting}
              onClick={() => void deleteSelected()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {bulkDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
        {bulkError ? (
          <p className="px-3 pb-2 text-xs text-tis-danger">{bulkError}</p>
        ) : null}
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
        className={`${selectedId ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col ${
          lime ? "overflow-hidden rounded-pane border border-tina-border bg-white" : ""
        }`}
      >
        {children ?? (
          <div
            className={`flex flex-1 items-center justify-center p-8 text-center text-sm ${
              lime ? "text-tina-muted" : "text-tis-muted"
            }`}
          >
            Select a session to read the parent ↔ Tina conversation.
          </div>
        )}
      </section>
    </div>
  );
}

function SegmentButton({
  label,
  count,
  active,
  tone = "sky",
  lime = false,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: "sky" | "amber";
  lime?: boolean;
  onClick: () => void;
}) {
  if (lime) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition ${
          active
            ? "bg-tina-active text-white"
            : "bg-tina-subtle text-tina-secondary hover:text-tina-text"
        }`}
      >
        {label}
        <span
          className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
            active ? "bg-tis-lime text-tis-on-lime" : "bg-white text-tina-muted"
          }`}
        >
          {count}
        </span>
      </button>
    );
  }
  const badge = active
    ? tone === "amber" && count > 0
      ? "bg-tis-amber text-tis-ink"
      : "bg-tis-unread text-white"
    : "bg-slate-200 text-tis-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold transition ${
        active ? "bg-white text-tis-navy shadow-sm" : "text-tis-muted hover:text-tis-navy"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-bold ${badge}`}>{count}</span>
    </button>
  );
}

export function ChatThreadDetail({
  session,
  interactions,
  adminReplies,
  parentStats,
  userEmail,
  parentLastMessageAt,
  threadError,
}: {
  session: ChatSessionRow;
  interactions: ChatInteraction[];
  adminReplies: AdminReply[];
  parentStats: ParentHistoryStats;
  userEmail: string;
  parentLastMessageAt: string | null;
  threadError?: string | null;
}) {
  const router = useRouter();
  const lime = isLimeLicorice(useUiTheme());
  /** Session details stay closed until View profile; panel close hides it. */
  const [showInfo, setShowInfo] = useState(false);
  const openInfo = () => setShowInfo(true);
  const closeInfo = () => setShowInfo(false);
  const onDeleted = () => router.push("/chats");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);

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
    // Opening a session only marks it read — never removes it from Chats.
    if (threadError || !session.unread) return;
    const supabase = createClient();
    void supabase
      .from("chat_sessions")
      .update({ admin_read_at: new Date().toISOString() })
      .eq("id", session.id)
      .then(() => router.refresh());
  }, [router, session.id, session.unread, threadError]);

  if (threadError) {
    return <div className="p-6 text-sm text-tis-danger">{threadError}</div>;
  }

  async function markNeedsAttention(interactionId: string) {
    setFlaggingId(interactionId);
    const supabase = createClient();
    const { error } = await supabase
      .from("interactions")
      .update({
        manual_attention_at: new Date().toISOString(),
        manual_attention_by: userEmail || null,
        reviewed_at: null,
        reviewed_by: null,
      })
      .eq("id", interactionId);
    setFlaggingId(null);
    setMenuId(null);
    if (error) {
      window.alert(`Could not mark needs attention: ${error.message}`);
      return;
    }
    // Fire-and-forget Web Push; failures must not block the inbox UI.
    void fetch("/api/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interaction_id: interactionId }),
    }).catch(() => undefined);
    // Fire-and-forget Slack #tina-needs-attention (Railway webhook).
    void fetch("/api/slack/needs-attention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interaction_id: interactionId }),
    }).catch(() => undefined);
    router.refresh();
  }

  async function onDelete() {
    if (
      !window.confirm(
        "Delete chat session?\nThis will permanently remove this session from Nabo.",
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
    <div className={`grid min-h-0 flex-1 ${showInfo ? "lg:grid-cols-[1fr_auto]" : ""}`}>
      <div className="flex min-h-0 min-w-0 flex-col">
        <header
          className={`flex items-center justify-between gap-3 px-4 py-3 sm:px-5 ${
            lime ? "border-b border-tina-border" : "border-b border-slate-100"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/chats"
              className="secondary !px-2.5 !py-1.5 text-xs lg:hidden"
              aria-label="Back to sessions"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <ParentAvatar waFrom={session.wa_from} size={lime ? 48 : 40} />
            <div className="min-w-0">
              <p
                className={`truncate font-bold ${
                  lime ? "text-[20px] font-semibold text-tina-text" : "text-tis-navy"
                }`}
              >
                {parentLabel(session.wa_from)}
              </p>
              <div
                className={`mt-0.5 flex flex-wrap items-center gap-1.5 text-xs ${
                  lime ? "text-tina-muted" : "text-tis-muted"
                }`}
              >
                <span>
                  {session.message_count} question{session.message_count === 1 ? "" : "s"}
                </span>
                <LanguageBadge language={session.primary_language} size="sm" />
                <span>· started {formatMessageTime(session.started_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {session.needs_attention && (
              <span className="mr-1 hidden sm:inline-flex">
                <AttentionBadge count={session.needs_attention_count} />
              </span>
            )}
            {lime ? (
              <button
                type="button"
                className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition ${
                  showInfo
                    ? "bg-tina-active text-white"
                    : "bg-tina-subtle text-tina-text hover:bg-tina-subtle/80"
                }`}
                onClick={openInfo}
                aria-pressed={showInfo}
              >
                <UserRound className="h-4 w-4" />
                View profile
              </button>
            ) : null}
            {target && isKnowledgeCandidateQuestion(target.question) ? (
              <IconButton
                label="Add to Knowledge Hub"
                href={knowledgeHubUrl(target.id)}
                lime={lime}
              >
                <BookOpen className="h-4 w-4" />
              </IconButton>
            ) : null}
            <IconButton
              label="Delete session"
              disabled={deleting}
              onClick={() => void onDelete()}
              lime={lime}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
            {lime ? null : (
              <IconButton label="Session information" active={showInfo} onClick={openInfo}>
                <PanelRight className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        </header>

        {deleteError && (
          <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-tis-danger">
            Could not delete: {deleteError}
          </p>
        )}

        <div
          className={`min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6 ${
            lime ? "bg-tina-workspace/40" : "bg-tis-cream/60"
          }`}
        >
          {timeline.length === 0 ? (
            <p className={`text-sm ${lime ? "text-tina-muted" : "text-tis-muted"}`}>
              No messages in this session.
            </p>
          ) : (
            timeline.map((message, index) => (
              <div key={message.id} className="space-y-4">
                {(index === 0 || dayLabel(timeline[index - 1].at) !== dayLabel(message.at)) && (
                  <div className="flex items-center gap-3">
                    <span className={`h-px flex-1 ${lime ? "bg-tina-border" : "bg-slate-200"}`} />
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide ${
                        lime ? "text-tina-muted" : "text-slate-400"
                      }`}
                    >
                      {dayLabel(message.at)}
                    </span>
                    <span className={`h-px flex-1 ${lime ? "bg-tina-border" : "bg-slate-200"}`} />
                  </div>
                )}
                <Bubble
                  message={message}
                  waFrom={session.wa_from}
                  language={session.primary_language}
                  menuOpen={menuId === message.id}
                  flagging={flaggingId === message.interactionId}
                  lime={lime}
                  onToggleMenu={() =>
                    setMenuId((current) => (current === message.id ? null : message.id))
                  }
                  onMarkNeedsAttention={
                    message.interactionId
                      ? () => void markNeedsAttention(message.interactionId!)
                      : undefined
                  }
                />
              </div>
            ))
          )}
        </div>

        <footer
          className={`bg-white px-4 py-3 sm:px-5 ${
            lime ? "border-t border-tina-border" : "border-t border-slate-100"
          }`}
        >
          {target ? (
            <div
              className={`rounded-2xl border bg-white p-3 ${
                lime ? "border-tina-border" : "border-slate-200"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-tis-muted">
                  Reply to parent{" "}
                  <span className="font-semibold text-tis-navy">
                    <AdminEnglishText
                      text={target.question}
                      language={session.primary_language}
                      plain
                    />
                  </span>
                </p>
                <ReplyWindowBadge lastInboundAt={lastInboundAt} />
              </div>
              <ReplyComposer
                interactionId={target.id}
                question={target.question}
                lastInboundAt={lastInboundAt}
                answeredAt={target.human_replied_at}
                answeredBy={target.human_replied_by}
                compact
              />
            </div>
          ) : (
            <p className="text-xs text-tis-muted">
              No parent question in this session to reply to.
            </p>
          )}
        </footer>
      </div>

      {showInfo && (
        <InfoPanel
          session={session}
          interactions={interactions}
          adminReplies={adminReplies}
          parentStats={parentStats}
          userEmail={userEmail}
          flagging={flaggingId != null}
          lime={lime}
          onClose={closeInfo}
          onMarkNeedsAttention={(id) => void markNeedsAttention(id)}
        />
      )}
    </div>
  );
}

function Bubble({
  message,
  waFrom,
  language,
  menuOpen,
  flagging,
  lime = false,
  onToggleMenu,
  onMarkNeedsAttention,
}: {
  message: ChatMessage;
  waFrom: string;
  language?: string | null;
  menuOpen: boolean;
  flagging?: boolean;
  lime?: boolean;
  onToggleMenu: () => void;
  onMarkNeedsAttention?: () => void;
}) {
  if (message.kind === "parent") {
    const canAddToHub =
      Boolean(message.interactionId) && isKnowledgeCandidateQuestion(message.text);

    return (
      <div className="flex items-start gap-2.5">
        <ParentAvatar waFrom={waFrom} size={32} />
        <div className="min-w-0 max-w-[85%] sm:max-w-[68%]">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={`text-[13px] font-bold ${lime ? "text-tina-text" : "text-tis-navy"}`}
            >
              Parent
            </span>
            <span className={`text-[11px] ${lime ? "text-tina-muted" : "text-slate-400"}`}>
              {timeOnly(message.at)}
            </span>
            {message.needsAttention && message.outcome ? (
              <OutcomeBadge outcome={message.outcome} size="sm" />
            ) : message.needsAttention ? (
              <AttentionBadge size="sm" />
            ) : null}
            <div className="relative">
              <button
                type="button"
                className={`rounded p-0.5 ${
                  lime
                    ? "text-tina-muted hover:bg-tina-subtle hover:text-tina-text"
                    : "text-slate-400 hover:bg-slate-200/70 hover:text-tis-navy"
                }`}
                aria-label="Parent message actions"
                aria-expanded={menuOpen}
                onClick={onToggleMenu}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute left-0 z-10 mt-1 w-56 rounded-xl border border-slate-100 bg-white py-1 shadow-card">
                  {canAddToHub && message.interactionId ? (
                    <Link
                      href={knowledgeHubUrl(message.interactionId)}
                      className="block px-3 py-2 text-sm font-semibold text-tis-navy hover:bg-tis-mist"
                    >
                      Add to Knowledge Hub
                    </Link>
                  ) : null}
                  {onMarkNeedsAttention && (
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm font-semibold text-tis-navy hover:bg-tis-mist disabled:opacity-50"
                      disabled={flagging || message.needsAttention}
                      onClick={onMarkNeedsAttention}
                    >
                      {message.needsAttention
                        ? "Already needs attention"
                        : flagging
                          ? "Marking…"
                          : "Mark needs attention"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div
            className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
              lime
                ? "rounded-2xl bg-tina-subtle text-tina-text"
                : "rounded-tl-md border border-slate-200/70 bg-white text-tis-ink"
            }`}
          >
            <AdminEnglishText
              text={message.text}
              language={language}
              storedEnglish={message.textEn}
              translationStatus={message.translationStatus}
            />
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = message.kind === "admin";
  const failed = isAdmin && message.status === "failed";
  const { body: tinaBody } = isAdmin
    ? { body: message.text }
    : stripSourceLines(message.text);
  const sources = isAdmin
    ? { titles: [] as string[], quote: null as string | null }
    : sourceTitles(message.documentTitles, message.text);
  const adminName = adminDisplayName(message.sentBy);

  return (
    <div className="flex items-start justify-end gap-2.5">
      <div className="min-w-0 max-w-[85%] sm:max-w-[68%]">
        <div className="mb-1 flex items-center justify-end gap-2">
          <span className={`text-[11px] ${lime ? "text-tina-muted" : "text-slate-400"}`}>
            {timeOnly(message.at)}
          </span>
          <span className={`text-[13px] font-bold ${lime ? "text-tina-text" : "text-tis-navy"}`}>
            {isAdmin ? adminName : "Tina"}
          </span>
          {failed && (
            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-tis-danger">
              Not delivered
            </span>
          )}
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm ${
            failed
              ? "border border-rose-200 bg-rose-50 text-rose-900"
              : lime
                ? isAdmin
                  ? "bg-tis-blue text-white"
                  : "bg-tis-lime-soft text-tina-text"
                : isAdmin
                  ? "rounded-tr-md bg-tis-blue text-white"
                  : "rounded-tr-md bg-tis-navy text-white"
          }`}
        >
          {isAdmin ? (
            <WaMessage text={tinaBody} />
          ) : (
            <AdminEnglishText
              text={tinaBody}
              language={language}
              storedEnglish={message.textEn}
              translationStatus={message.translationStatus}
            />
          )}
          {!isAdmin && sources.titles.length > 0 ? (
            <SourceChip titles={sources.titles} quote={sources.quote} onLight={lime} />
          ) : null}
        </div>
      </div>
      {isAdmin ? (
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tis-blue text-[11px] font-bold text-white"
          aria-label={adminName}
          title={adminName}
        >
          {adminName.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        <Image
          src="/tina.png"
          alt="Tina"
          width={32}
          height={32}
          className="shrink-0 rounded-full object-cover ring-1 ring-tis-ink"
        />
      )}
    </div>
  );
}

function InfoPanel({
  session,
  interactions,
  adminReplies,
  parentStats,
  userEmail,
  flagging,
  lime = false,
  onClose,
  onMarkNeedsAttention,
}: {
  session: ChatSessionRow;
  interactions: ChatInteraction[];
  adminReplies: AdminReply[];
  parentStats: ParentHistoryStats;
  userEmail: string;
  flagging: boolean;
  lime?: boolean;
  onClose: () => void;
  onMarkNeedsAttention: (interactionId: string) => void;
}) {
  const lastQuestion = interactions[interactions.length - 1];
  const outcomes = interactions.reduce<Record<string, number>>((acc, item) => {
    acc[item.outcome] = (acc[item.outcome] || 0) + 1;
    return acc;
  }, {});
  const outcomeCount = Object.values(outcomes).reduce((sum, n) => sum + n, 0);
  const aiOutcomesCount =
    parentStats.answeredFromKnowledge +
    parentStats.aiCouldNotAnswer +
    parentStats.addedToKnowledgeHub;
  const questionLabel = `${session.message_count} question${
    session.message_count === 1 ? "" : "s"
  }`;

  return (
    <aside
      className={`w-full min-h-0 overflow-y-auto bg-white p-4 lg:w-[300px] lg:border-t-0 ${
        lime
          ? "border-t border-tina-border lg:border-l"
          : "border-t border-slate-100 lg:border-l"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            className={`text-[15px] font-bold tracking-tight ${
              lime ? "text-tina-text" : "text-tis-navy"
            }`}
          >
            Session details
          </h2>
          <p
            className={`mt-0.5 text-[12px] leading-snug ${
              lime ? "text-tina-muted" : "text-tis-muted"
            }`}
          >
            Overview of this parent&apos;s conversation
          </p>
        </div>
        <button
          type="button"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
            lime
              ? "text-tina-muted hover:bg-tina-subtle hover:text-tina-text"
              : "text-slate-400 hover:bg-slate-100 hover:text-tis-navy"
          }`}
          aria-label="Close session details"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div
        className={`rounded-2xl p-3 shadow-sm ${
          lime
            ? "border border-tina-border bg-tina-subtle/60"
            : "border border-slate-200/80 bg-white"
        }`}
      >
        <div className="flex items-center gap-3">
          <ParentAvatar waFrom={session.wa_from} size={48} />
          <div className="min-w-0">
            <p
              className={`truncate text-[14px] font-bold ${
                lime ? "text-tina-text" : "text-tis-navy"
              }`}
            >
              {parentLabel(session.wa_from)}
            </p>
            <p className={`text-[12px] ${lime ? "text-tina-muted" : "text-tis-muted"}`}>
              WhatsApp parent
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <LanguageBadge language={session.primary_language} size="sm" />
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              lime
                ? "bg-white text-tina-text ring-1 ring-tina-border"
                : "border border-slate-200 bg-slate-50 text-tis-navy"
            }`}
          >
            {questionLabel}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        <AttentionStatusCard
          needsAttention={session.needs_attention}
          count={session.needs_attention_count}
        />
        {lastQuestion ? (
          <>
            <button
              type="button"
              className="primary w-full justify-center !text-[13px]"
              disabled={flagging || session.needs_attention}
              aria-disabled={flagging || session.needs_attention}
              onClick={() => onMarkNeedsAttention(lastQuestion.id)}
            >
              <AlertCircle className="h-4 w-4" aria-hidden />
              {flagging
                ? "Marking…"
                : session.needs_attention
                  ? "Already needs attention"
                  : "Mark as Needs attention"}
            </button>
            {session.needs_attention ? (
              <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Flagged for follow-up
              </p>
            ) : null}
            <Link
              href="/inbox"
              className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-tis-blue no-underline hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open in Needs Attention queue
            </Link>
          </>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        <Section title="Session summary" icon={CalendarDays}>
          <DetailRow label="Started" value={formatMessageTime(session.started_at)} />
          <DetailRow label="Last activity" value={formatMessageTime(session.last_message_at)} />
          <div className="flex items-center justify-between gap-2 px-1 py-2 text-[12px]">
            <span className="shrink-0 text-slate-500">Language</span>
            <LanguageBadge language={session.primary_language} size="sm" />
          </div>
          <DetailRow label="Questions in this session" value={String(session.message_count)} />
        </Section>

        <Section title="Outcomes (this session)" icon={ListChecks} count={outcomeCount}>
          <div className="px-1 py-1.5">
            <OutcomeSummaryList outcomes={outcomes} />
          </div>
        </Section>

        <Section title="All sessions" icon={MessageCircle} count={parentStats.totalSessions}>
          <DetailRow label="Total questions" value={String(parentStats.totalQuestions)} />
          <DetailRow label="Total sessions" value={String(parentStats.totalSessions)} />
          <DetailRow label="Unique questions" value={String(parentStats.uniqueQuestions)} />
          <DetailRow
            label="First seen"
            value={parentStats.firstSeen ? formatMessageTime(parentStats.firstSeen) : "—"}
          />
          <DetailRow
            label="Last seen"
            value={parentStats.lastSeen ? formatMessageTime(parentStats.lastSeen) : "—"}
          />
        </Section>

        <Section title="AI outcomes" icon={Sparkles} count={aiOutcomesCount}>
          <DetailRow
            label="Answered from knowledge"
            value={String(parentStats.answeredFromKnowledge)}
          />
          <DetailRow label="AI couldn't answer" value={String(parentStats.aiCouldNotAnswer)} />
          <DetailRow label="Human replies" value={String(parentStats.humanReplies)} />
          <DetailRow
            label="Added to Knowledge Hub"
            value={String(parentStats.addedToKnowledgeHub)}
          />
        </Section>

        <Section title="Human replies" icon={UserRound} count={adminReplies.length}>
          {adminReplies.length === 0 ? (
            <p className="px-1 py-2 text-xs text-tis-muted">
              No admin has replied in this session.
            </p>
          ) : (
            adminReplies.map((reply) => (
              <DetailRow
                key={reply.id}
                label={`${reply.status === "failed" ? "Failed" : "Sent"} ${formatMessageTime(
                  reply.created_at,
                )}`}
                value={adminDisplayName(reply.sent_by)}
              />
            ))
          )}
        </Section>

        <Section title="Troubleshooting" icon={AlertTriangle}>
          <DetailRow label="WhatsApp" value={session.wa_from} mono />
          <DetailRow label="Session ID" value={session.id} mono />
          {userEmail ? <DetailRow label="Signed in as" value={userEmail} /> : null}
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  count,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  count?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`overflow-hidden rounded-xl border transition ${
        open
          ? "border-tina-border bg-white shadow-sm"
          : "border-transparent bg-tina-subtle"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className="h-4 w-4 shrink-0 text-tina-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-tis-navy">
          {title}
        </span>
        {count != null ? (
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold tabular-nums text-tis-navy ring-1 ring-tina-border">
            {count}
          </span>
        ) : null}
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-tina-muted" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-tina-muted" aria-hidden />
        )}
      </button>
      {open ? (
        <div className="divide-y divide-tina-border border-t border-tina-border px-3 pb-1.5 pt-0.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 py-2 text-[12px]">
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
