"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdminEnglishText } from "@/components/admin-english-text";
import { LanguageBadge } from "@/components/language-badge";
import { OutcomeBadge } from "@/components/outcome-badge";
import { ParentAvatar } from "@/components/parent-avatar";
import { ReplyComposer } from "@/components/reply-composer";
import { parentLabel } from "@/lib/chats";
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
        Nothing needs attention right now — no automatic gaps and no manually flagged
        questions.
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const source =
          row.attention_source === "manual" || row.manual_attention_at
            ? "manual"
            : "auto";
        const waFrom = row.wa_from || "";
        return (
          <li key={row.id} className="card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2.5">
                  {waFrom ? <ParentAvatar waFrom={waFrom} size={40} /> : null}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-tis-navy">
                      {waFrom ? parentLabel(waFrom) : "Parent"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          source === "manual"
                            ? "bg-tis-lilac/25 text-tis-ink"
                            : "bg-tis-amber/35 text-tis-ink"
                        }`}
                      >
                        {source === "manual" ? "Marked" : "Auto gap"}
                      </span>
                      <LanguageBadge language={row.language} size="sm" />
                      <OutcomeBadge outcome={row.outcome} size="sm" />
                    </div>
                  </div>
                </div>
                <div className="font-semibold text-tis-navy">
                  <AdminEnglishText
                    text={row.question}
                    language={row.language}
                    storedEnglish={row.question_en}
                    translationStatus={
                      (row.translation_status as
                        | "pending"
                        | "done"
                        | "skipped"
                        | "failed"
                        | null) || null
                    }
                  />
                </div>
                {row.reply && (
                  <div className="mt-2 text-sm text-tis-navy">
                    <AdminEnglishText
                      text={row.reply}
                      language={row.language}
                      storedEnglish={row.reply_en}
                      translationStatus={
                        (row.translation_status as
                          | "pending"
                          | "done"
                          | "skipped"
                          | "failed"
                          | null) || null
                      }
                    />
                  </div>
                )}
                <dl className="mt-3 grid gap-1 text-xs text-tis-navy/70 sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold text-tis-navy">Top similarity: </dt>
                    <dd className="inline">{row.top_similarity != null ? row.top_similarity.toFixed(3) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-tis-navy">When: </dt>
                    <dd className="inline">{new Date(row.created_at).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Link href={`/knowledge/new?from=${row.id}`} className="primary !no-underline">
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
        );
      })}
    </ul>
  );
}
