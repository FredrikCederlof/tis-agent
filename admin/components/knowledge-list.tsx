"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { KnowledgeEntry, KnowledgeOrigin, KnowledgeStatus } from "@/lib/types";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function KnowledgeList({ rows }: { rows: KnowledgeEntry[] }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [origin, setOrigin] = useState<"" | KnowledgeOrigin>("");
  const [status, setStatus] = useState<"" | KnowledgeStatus>("active");

  const tags = useMemo(() => {
    const found = new Set<string>();
    for (const row of rows) {
      for (const item of row.tags || []) {
        if (item) found.add(item);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (origin && row.origin !== origin) return false;
      if (status && row.status !== status) return false;
      if (tag && !(row.tags || []).includes(tag)) return false;
      if (!needle) return true;
      const haystack = [
        row.primary_question,
        row.answer,
        ...(row.similar_questions || []),
        ...(row.tags || []),
        row.source_note || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [origin, query, rows, status, tag]);

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="label">Search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Question, answer, tag…"
          />
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
        <label className="block">
          <span className="label">Origin</span>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value as "" | KnowledgeOrigin)}
          >
            <option value="">All origins</option>
            <option value="manual">Manual</option>
            <option value="inbox">Inbox</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | KnowledgeStatus)}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="">All</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-sm text-tis-muted">
          No Knowledge Hub entries match these filters.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => (
            <li key={row.id}>
              <Link
                href={`/knowledge/${row.id}`}
                className="card block transition hover:border-tis-sky/40 hover:shadow-md"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-tis-navy">{row.primary_question}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-tis-muted">{row.answer}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Updated {formatWhen(row.updated_at)}
                      {row.created_at !== row.updated_at
                        ? ` · created ${formatWhen(row.created_at)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        row.origin === "inbox"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {row.origin === "inbox" ? "Inbox" : "Manual"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        row.status === "archived"
                          ? "bg-rose-50 text-tis-danger"
                          : "bg-emerald-50 text-tis-success"
                      }`}
                    >
                      {row.status}
                    </span>
                    {(row.tags || []).slice(0, 3).map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-tis-mist px-2.5 py-0.5 text-xs font-semibold text-tis-sky"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
