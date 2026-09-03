"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ReplyComposer } from "@/components/reply-composer";
import { WaMessage } from "@/components/wa-message";
import type { UnansweredRow } from "@/lib/types";

export function InboxList({
  rows,
  userEmail,
  lastInboundByParent = {},
}: {
  rows: UnansweredRow[];
  userEmail: string;
  lastInboundByParent?: Record<string, string>;
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
              {row.reply && (
                <WaMessage text={row.reply} className="mt-2 text-sm text-tis-muted" />
              )}
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
            <div className="flex shrink-0 flex-col gap-2">
              <Link
                href={`/knowledge/new?from=${row.id}`}
                className="primary !no-underline"
              >
                Add to Knowledge Hub
              </Link>
              {row.session_id && (
                <Link
                  href={`/chats/${row.session_id}`}
                  className="secondary !no-underline"
                >
                  <MessageSquare className="h-4 w-4" />
                  Open conversation
                </Link>
              )}
              <button
                type="button"
                className="secondary"
                disabled={busyId === row.id}
                onClick={() => markReviewed(row.id)}
              >
                {busyId === row.id ? "Saving…" : "Mark reviewed"}
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-tis-navy">Reply to parent</p>
            <ReplyComposer
              interactionId={row.id}
              question={row.question}
              lastInboundAt={lastInboundByParent[row.wa_from || ""] || row.created_at}
              answeredAt={row.human_replied_at}
              answeredBy={row.human_replied_by}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
