"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UnansweredRow } from "@/lib/types";

export function InboxList({
  rows,
  userEmail,
}: {
  rows: UnansweredRow[];
  userEmail: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function markReviewed(id: string) {
    setBusyId(id);
    const supabase = createClient();
    await supabase
      .from("interactions")
      .update({
        reviewed_at: new Date().toISOString(),
        reviewed_by: userEmail,
      })
      .eq("id", id);
    setBusyId(null);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="card text-sm text-tis-muted">
        No open gaps — Tina has no unanswered questions waiting for review.
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.id} className="card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-tis-navy">{row.question}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-tis-muted">{row.reply}</p>
              <dl className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                <div>
                  <dt className="inline font-semibold text-slate-600">Outcome: </dt>
                  <dd className="inline">{row.outcome}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-slate-600">Language: </dt>
                  <dd className="inline">{row.language}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-slate-600">Top similarity: </dt>
                  <dd className="inline">
                    {row.top_similarity != null ? row.top_similarity.toFixed(3) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-slate-600">When: </dt>
                  <dd className="inline">{new Date(row.created_at).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
            <button
              type="button"
              className="primary shrink-0"
              disabled={busyId === row.id}
              onClick={() => markReviewed(row.id)}
            >
              {busyId === row.id ? "Saving…" : "Mark reviewed"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
