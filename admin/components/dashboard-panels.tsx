import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  MessageCircle,
  Plus,
  Upload,
} from "lucide-react";
import { attentionReason } from "@/lib/dashboard";
import type { TopQuestion } from "@/lib/dashboard";
import { formatRelativeTime, parentLabel, type ChatSessionRow } from "@/lib/chats";
import { IconWell } from "@/components/charts";
import { ParentAvatar } from "@/components/parent-avatar";

function statusPillClass(tone: "amber" | "rose" | "blue" | "gray"): string {
  if (tone === "amber") return "bg-[var(--tina-warning-soft,#fff0d2)] text-[var(--tina-warning,#8b4b00)]";
  if (tone === "rose") return "bg-[var(--tina-danger-soft,#ffe9ed)] text-[var(--tina-danger,#d71938)]";
  if (tone === "blue") return "bg-[#e7efff] text-[#3b5ccc]";
  return "bg-tina-subtle text-tina-secondary";
}

export function NeedsAttentionPanel({
  rows,
  total,
}: {
  rows: {
    id: string;
    session_id: string;
    question: string;
    outcome: string;
    created_at: string;
    wa_from?: string | null;
  }[];
  total: number;
}) {
  return (
    <section className="card flex h-full min-w-0 flex-col !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <IconWell tone="amber">
            <AlertTriangle className="h-4 w-4" strokeWidth={2} />
          </IconWell>
          <div>
            <h2 className="text-lg font-semibold text-tina-text">Needs attention</h2>
            <p className="text-sm text-tina-muted">Latest questions that need your review</p>
          </div>
        </div>
        <Link
          href="/inbox"
          className="inline-flex items-center gap-1 text-sm font-semibold text-tina-text"
        >
          View all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-tina-muted">Nothing waiting in Needs attention.</p>
      ) : (
        <ul className="divide-y divide-tina-border">
          {rows.map((row) => {
            const reason = attentionReason(row.outcome);
            return (
              <li key={row.id}>
                <Link
                  href={`/chats/${row.session_id}`}
                  className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-tina-subtle/70"
                >
                  <ParentAvatar waFrom={row.wa_from || ""} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-tina-text">
                        {parentLabel(row.wa_from)}
                      </p>
                      <span className="shrink-0 text-[11px] text-tina-muted">
                        {formatRelativeTime(row.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-tina-secondary">{row.question}</p>
                  </div>
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusPillClass(reason.tone)}`}
                  >
                    {reason.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** @deprecated Prefer NeedsAttentionPanel — kept for any lingering imports. */
export function NeedsAttentionTable(props: {
  rows: {
    id: string;
    session_id: string;
    question: string;
    outcome: string;
    created_at: string;
    wa_from?: string | null;
  }[];
  total: number;
}) {
  return <NeedsAttentionPanel {...props} />;
}

export function RecentConversationsPanel({
  sessions,
}: {
  sessions: ChatSessionRow[];
}) {
  return (
    <section className="card flex h-full min-w-0 flex-col !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <IconWell tone="blue">
            <MessageCircle className="h-4 w-4" strokeWidth={2} />
          </IconWell>
          <div>
            <h2 className="text-lg font-semibold text-tina-text">Recent conversations</h2>
            <p className="text-sm text-tina-muted">Latest parent chats with Tina</p>
          </div>
        </div>
        <Link
          href="/chats"
          className="inline-flex items-center gap-1 text-sm font-semibold text-tina-text"
        >
          View all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {sessions.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-tina-muted">No conversations yet.</p>
      ) : (
        <ul className="divide-y divide-tina-border">
          {sessions.map((row) => {
            const badge =
              row.needs_attention_count > 0
                ? row.needs_attention_count
                : row.unread
                  ? Math.max(1, row.message_count > 0 ? 1 : 0)
                  : 0;
            return (
              <li key={row.id}>
                <Link
                  href={`/chats/${row.id}`}
                  className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-tina-subtle/70"
                >
                  <ParentAvatar waFrom={row.wa_from} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={`truncate text-sm ${
                          row.unread ? "font-bold" : "font-semibold"
                        } text-tina-text`}
                      >
                        {parentLabel(row.wa_from)}
                      </p>
                      <span className="shrink-0 text-[11px] text-tina-muted">
                        {formatRelativeTime(row.last_message_at)}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 truncate text-[13px] ${
                        row.unread ? "font-medium text-tina-text" : "text-tina-secondary"
                      }`}
                    >
                      {row.last_question || "No messages"}
                    </p>
                  </div>
                  {badge > 0 ? (
                    <span className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-tis-lime px-1.5 text-[11px] font-semibold text-tis-on-lime">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function TopQuestionsCard({ questions }: { questions: TopQuestion[] }) {
  return (
    <section className="card flex min-w-0 flex-col">
      <div className="flex items-center gap-2.5">
        <IconWell>
          <MessageCircle className="h-4 w-4" strokeWidth={2} />
        </IconWell>
        <div>
          <h2 className="text-lg font-semibold text-tina-text">Top questions</h2>
          <p className="text-sm text-tina-muted">Most asked this period</p>
        </div>
      </div>
      {questions.length === 0 ? (
        <p className="mt-4 text-sm text-tina-muted">No questions in this period yet.</p>
      ) : (
        <ol className="mt-4 flex-1 space-y-0.5">
          {questions.map((item, index) => (
            <li key={`${item.topic}-${index}`}>
              <div className="flex items-center gap-3 rounded-xl px-1 py-2 text-sm">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-tina-subtle text-[11px] font-semibold text-tina-secondary">
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 truncate font-medium text-tina-text">{item.topic}</p>
                <span className="shrink-0 text-xs font-medium text-tina-muted">{item.count}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** @deprecated Prefer TopQuestionsCard */
export function TopKnowledgeGapsCard({
  gaps,
}: {
  gaps: TopQuestion[];
}) {
  return <TopQuestionsCard questions={gaps} />;
}

export function KnowledgeHubCard({ suggestedCount = 0 }: { suggestedCount?: number }) {
  return (
    <section className="card flex min-w-0 flex-col">
      <div className="flex items-center gap-2.5">
        <IconWell tone="green">
          <BookOpen className="h-4 w-4" strokeWidth={2} />
        </IconWell>
        <div>
          <h2 className="text-lg font-semibold text-tina-text">Knowledge Hub</h2>
          <p className="text-sm text-tina-muted">Grow Tina&apos;s answers</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5">
        <li>
          <Link
            href="/knowledge/new"
            className="flex items-center gap-3 rounded-xl bg-tis-lime-soft px-3 py-2.5 text-sm font-semibold text-tina-text transition hover:brightness-95"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tis-lime text-tis-on-lime">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="flex-1">Add new Q&amp;A</span>
            <ChevronRight className="h-4 w-4 text-tina-muted" />
          </Link>
        </li>
        <li>
          <Link
            href="/inbox"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-tina-text transition hover:bg-tina-subtle"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tina-subtle text-tina-secondary">
              <BookOpen className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="flex-1">Review suggested Q&amp;As</span>
            {suggestedCount > 0 ? (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-tis-lime px-1.5 text-[11px] font-semibold text-tis-on-lime">
                {suggestedCount > 99 ? "99+" : suggestedCount}
              </span>
            ) : (
              <ChevronRight className="h-4 w-4 text-tina-muted" />
            )}
          </Link>
        </li>
        <li>
          <Link
            href="/chats"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-tina-text transition hover:bg-tina-subtle"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tina-subtle text-tina-secondary">
              <Upload className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="flex-1">Import from WhatsApp chats</span>
            <ChevronRight className="h-4 w-4 text-tina-muted" />
          </Link>
        </li>
      </ul>
    </section>
  );
}
