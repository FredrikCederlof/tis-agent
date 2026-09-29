"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type MatchedDoc = { id: string; title: string };

export function SourceChip({
  titles,
  quote,
}: {
  titles: string[];
  quote?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<MatchedDoc[] | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const primary = titles[0] || "Source";

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || matches != null || titles.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("documents")
          .select("id, title")
          .in("title", titles)
          .limit(20);
        if (!cancelled) setMatches((data as MatchedDoc[]) || []);
      } catch {
        if (!cancelled) setMatches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, matches, titles]);

  if (!titles.length) return null;

  const label =
    titles.length === 1 ? `Source: ${primary}` : `Sources: ${titles.join(", ")}`;

  return (
    <div className="relative mt-1.5" ref={rootRef}>
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-left text-[11px] font-semibold text-white transition hover:bg-white/25"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <FileText className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{primary}</span>
        {titles.length > 1 ? (
          <span className="shrink-0 opacity-80">+{titles.length - 1}</span>
        ) : null}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Source details"
          className="absolute left-0 z-20 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-card"
        >
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Sources
          </p>
          <ul className="space-y-2">
            {titles.map((title) => {
              const match = matches?.find(
                (doc) => doc.title.toLowerCase() === title.toLowerCase(),
              );
              return (
                <li key={title} className="text-sm text-tis-navy">
                  <p className="font-semibold leading-snug">{title}</p>
                  {match ? (
                    <Link
                      href="/sync"
                      className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-tis-blue no-underline hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      <BookOpen className="h-3 w-3" />
                      Open in Sync
                    </Link>
                  ) : matches != null ? (
                    <p className="mt-0.5 text-[11px] text-tis-muted">
                      Document not found in Sync — it may have been removed.
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-slate-400">Looking up…</p>
                  )}
                </li>
              );
            })}
          </ul>
          {quote ? (
            <p className="mt-2 border-t border-slate-100 pt-2 text-[12px] italic text-tis-muted">
              “{quote}”
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
