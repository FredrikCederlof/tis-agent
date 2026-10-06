"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  AUDIENCE_OPTIONS,
  CONTENT_OWNERS,
  PAGE_SIZE,
  effectiveKnowledgeStatus,
  filterKnowledgeList,
  formatIngestedParts,
  formatKnowledgeDate,
  isReviewOverdue,
  knowledgeListStatusLabel,
  knowledgeListTabCounts,
  pageCount,
  paginate,
  sortKnowledgeList,
  type KnowledgeListSortDir,
  type KnowledgeListSortKey,
  type KnowledgeListStatusTab,
} from "@/lib/knowledge-hub";
import type { KnowledgeEntry, KnowledgeOrigin, KnowledgeStatus } from "@/lib/types";

function statusDotClass(label: string): string {
  switch (label) {
    case "Review due":
      return "bg-amber-500";
    case "Expired":
      return "bg-slate-400";
    case "Draft":
      return "bg-slate-400";
    case "Archived":
      return "bg-rose-400";
    default:
      return "bg-emerald-500";
  }
}

function reviewCell(row: KnowledgeEntry): { text: string; tone: "muted" | "warn" | "danger" } {
  const resolved = effectiveKnowledgeStatus(row);
  if (resolved === "expired" && row.valid_until) {
    return {
      text: `Expired ${formatKnowledgeDate(row.valid_until)}`,
      tone: "danger",
    };
  }
  if (isReviewOverdue(row) && row.review_due_date) {
    return {
      text: `Review ${formatKnowledgeDate(row.review_due_date)}`,
      tone: "warn",
    };
  }
  if (row.review_due_date) {
    return {
      text: `Review ${formatKnowledgeDate(row.review_due_date)}`,
      tone: "muted",
    };
  }
  if (row.valid_until) {
    return {
      text: `Until ${formatKnowledgeDate(row.valid_until)}`,
      tone: "muted",
    };
  }
  return { text: "—", tone: "muted" };
}

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: KnowledgeListSortDir;
}) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />;
  if (dir === "asc") return <ArrowUp className="h-3.5 w-3.5" aria-hidden />;
  return <ArrowDown className="h-3.5 w-3.5" aria-hidden />;
}

const STATUS_TABS: { id: KnowledgeListStatusTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "needs_review", label: "Needs review" },
  { id: "draft", label: "Draft" },
  { id: "expired", label: "Expired" },
];

function ArticleRowMenu({
  row,
  deleting,
  onDelete,
}: {
  row: KnowledgeEntry;
  deleting: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const width = 160;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const estimatedHeight = 96;
      const top =
        rect.bottom + estimatedHeight > window.innerHeight - 8
          ? Math.max(8, rect.top - estimatedHeight - 4)
          : rect.bottom + 4;
      setPos({ top, left });
    }
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    function onResize() {
      setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        ref={buttonRef}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-tis-muted transition hover:bg-tis-mist hover:text-tis-navy"
        aria-label={`Actions for ${row.primary_question}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 min-w-[10rem] rounded-xl border border-black/[0.06] bg-white py-1 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
          >
            <Link
              href={`/knowledge/${row.id}`}
              role="menuitem"
              className="block px-3 py-2 text-sm font-medium text-tis-navy hover:bg-tis-mist"
              onClick={() => setOpen(false)}
            >
              Edit
            </Link>
            <div className="my-1 border-t border-black/[0.06]" />
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm font-medium text-tis-danger hover:bg-rose-50 disabled:opacity-50"
              disabled={deleting}
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function KnowledgeList({
  rows,
  emptyLabel = "No Knowledge Hub entries match these filters.",
}: {
  rows: KnowledgeEntry[];
  emptyLabel?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [origin, setOrigin] = useState<"" | KnowledgeOrigin>("");
  const [audience, setAudience] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<"" | KnowledgeStatus>("");
  const [statusTab, setStatusTab] = useState<KnowledgeListStatusTab>("all");
  const [showMore, setShowMore] = useState(false);
  const [sortKey, setSortKey] = useState<KnowledgeListSortKey>("question");
  const [sortDir, setSortDir] = useState<KnowledgeListSortDir>("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tags = useMemo(() => {
    const found = new Set<string>();
    for (const row of rows) {
      for (const item of row.tags || []) {
        if (item) found.add(item);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const owners = useMemo(() => {
    const found = new Set<string>(CONTENT_OWNERS);
    for (const row of rows) {
      if (row.content_owner?.trim()) found.add(row.content_owner.trim());
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const tabCounts = useMemo(
    () => knowledgeListTabCounts(rows.filter((row) => !removedIds.has(row.id))),
    [removedIds, rows],
  );

  const filtered = useMemo(
    () =>
      filterKnowledgeList(
        rows.filter((row) => !removedIds.has(row.id)),
        {
          query,
          statusTab,
          status,
          origin,
          audience,
          owner,
          tag,
        },
      ),
    [audience, origin, owner, query, removedIds, rows, status, statusTab, tag],
  );

  const sorted = useMemo(
    () => sortKnowledgeList(filtered, sortKey, sortDir),
    [filtered, sortDir, sortKey],
  );

  useEffect(() => {
    setPage(1);
  }, [query, tag, origin, audience, owner, status, statusTab, sortKey, sortDir]);

  const pages = pageCount(sorted.length);
  const safePage = Math.min(page, pages);
  const visible = paginate(sorted, safePage);
  const allVisibleSelected =
    visible.length > 0 && visible.every((row) => selected.has(row.id));

  function toggleSort(key: KnowledgeListSortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "question" ? "asc" : "desc");
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const row of visible) next.delete(row.id);
      } else {
        for (const row of visible) next.add(row.id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteArticle(row: KnowledgeEntry) {
    if (
      !window.confirm(
        `Delete “${row.primary_question}” permanently?\n\nTina will stop using this article. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(row.id);
    setError(null);
    try {
      const response = await fetch(`/api/knowledge/${row.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Delete failed (${response.status})`);
      }
      setRemovedIds((current) => new Set(current).add(row.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function SortHeader({
    label,
    column,
    className = "",
  }: {
    label: string;
    column: KnowledgeListSortKey;
    className?: string;
  }) {
    const active = sortKey === column;
    return (
      <th className={`px-4 py-3 font-bold ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={`inline-flex items-center gap-1.5 text-left transition hover:text-tis-navy ${
            active ? "text-tis-navy" : "text-tis-muted"
          }`}
          aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
          {label}
          <SortIcon active={active} dir={sortDir} />
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count = tabCounts[tab.id];
          const active = statusTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatusTab(tab.id);
                setStatus("");
              }}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                active
                  ? "bg-tis-acid text-tis-ink shadow-sm"
                  : "bg-white text-tis-navy ring-1 ring-black/[0.06] hover:bg-tis-mist"
              }`}
            >
              {tab.id === "needs_review" && count > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              )}
              {tab.label}{" "}
              <span className={active ? "opacity-80" : "text-tis-muted"}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search</span>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tis-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles, questions, answers or tags..."
            className="pl-10"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:shrink-0">
          <label className="block min-w-[8.5rem]">
            <span className="sr-only">Status</span>
            <select
              value={status}
              onChange={(e) => {
                const next = e.target.value as "" | KnowledgeStatus;
                setStatus(next);
                if (next) setStatusTab("all");
              }}
              aria-label="Status"
            >
              <option value="">Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="block min-w-[8.5rem]">
            <span className="sr-only">Applies to</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              aria-label="Applies to"
            >
              <option value="">Applies to</option>
              {AUDIENCE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All parents" : item}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[8.5rem]">
            <span className="sr-only">Origin</span>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value as "" | KnowledgeOrigin)}
              aria-label="Origin"
            >
              <option value="">Origin</option>
              <option value="manual">Manual</option>
              <option value="inbox">Inbox</option>
            </select>
          </label>
          <button
            type="button"
            className={`secondary inline-flex items-center justify-center gap-2 ${
              showMore || tag || owner ? "ring-2 ring-tis-navy/15" : ""
            }`}
            aria-pressed={showMore}
            onClick={() => setShowMore((current) => !current)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            More filters
          </button>
        </div>
      </div>

      {showMore && (
        <div className="card grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Owner</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">All owners</option>
              {owners.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Tag</span>
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All tags</option>
              {tags.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">{error}</p>
      )}

      {sorted.length === 0 ? (
        <div className="card text-sm text-tis-muted">
          {rows.filter((row) => !removedIds.has(row.id)).length === 0
            ? "No knowledge articles in this category yet."
            : emptyLabel || "No matching search results."}
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-black/[0.06] bg-tis-mist/40 text-[11px] uppercase tracking-wide text-tis-muted">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select all on this page"
                        className="h-4 w-4 rounded border-black/20"
                      />
                    </th>
                    <SortHeader label="Question / Article" column="question" />
                    <SortHeader label="Tags" column="tags" />
                    <SortHeader label="Status" column="status" />
                    <SortHeader label="Review / Expiration" column="review" />
                    <SortHeader label="Last ingested" column="ingested" />
                    <th className="w-12 px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {visible.map((row) => {
                    const statusLabel = knowledgeListStatusLabel(row);
                    const review = reviewCell(row);
                    const ingested = formatIngestedParts(row.last_ingested_at);
                    return (
                      <tr key={row.id} className="hover:bg-tis-mist/30">
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleOne(row.id)}
                            aria-label={`Select ${row.primary_question}`}
                            className="mt-1 h-4 w-4 rounded border-black/20"
                          />
                        </td>
                        <td className="max-w-[22rem] px-4 py-3 align-top">
                          <Link href={`/knowledge/${row.id}`} className="block min-w-0">
                            <p className="font-semibold text-tis-ink">{row.primary_question}</p>
                            <p className="mt-0.5 line-clamp-1 text-sm text-tis-muted">
                              {row.answer}
                            </p>
                          </Link>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex max-w-[12rem] flex-wrap gap-1">
                            {(row.tags || []).length === 0 ? (
                              <span className="text-tis-muted">—</span>
                            ) : (
                              (row.tags || []).map((item) => (
                                <span
                                  key={item}
                                  className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                                >
                                  {item}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <span className="inline-flex items-center gap-2 text-sm font-medium text-tis-ink">
                            <span
                              className={`h-2 w-2 rounded-full ${statusDotClass(statusLabel)}`}
                              aria-hidden
                            />
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <span
                            className={
                              review.tone === "danger"
                                ? "text-sm font-medium text-tis-danger"
                                : review.tone === "warn"
                                  ? "text-sm font-medium text-amber-700"
                                  : "text-sm text-tis-muted"
                            }
                          >
                            {review.text}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap text-sm text-tis-muted">
                          {ingested ? (
                            <span className="block leading-snug">
                              {ingested.date}
                              <br />
                              {ingested.time}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <ArticleRowMenu
                            row={row}
                            deleting={deletingId === row.id}
                            onDelete={() => void deleteArticle(row)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-tis-muted">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <span className="text-sm font-semibold text-tis-navy">
                  {safePage} / {pages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={safePage >= pages}
                  onClick={() => setPage((current) => Math.min(pages, current + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
