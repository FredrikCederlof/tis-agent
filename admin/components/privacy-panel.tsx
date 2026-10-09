"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Database, MessageCircle, Server, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/stat-card";

const PERIODS = [30, 90, 180, 365] as const;
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "retention", label: "Data retention" },
  { id: "requests", label: "Data requests" },
  { id: "knowledge", label: "Knowledge" },
  { id: "activity", label: "Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export type PrivacyDocument = {
  id: string;
  title: string;
  source_type: string | null;
  access_class: string;
};

export type PrivacyEvent = {
  id: string;
  event_type: string;
  actor: string;
  retention_days: number | null;
  sessions_deleted: number;
  dedup_deleted: number;
  created_at: string;
};

export type NoticePage = {
  id: string;
  published: boolean;
};

const FLOW = [
  {
    icon: MessageCircle,
    title: "WhatsApp",
    text: "Carries the phone number and the message.",
  },
  {
    icon: Server,
    title: "Railway, Singapore",
    text: "Receives the message and sends the reply.",
  },
  {
    icon: Sparkles,
    title: "OpenAI",
    text: "Writes the reply from the question, recent messages, and excerpts. The phone number is not included.",
  },
  {
    icon: Database,
    title: "Supabase, Tokyo",
    text: "Stores the conversation and the searchable knowledge.",
  },
];

function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "watch" | "neutral";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "bg-[var(--tina-success-soft,#effbea)] text-[var(--tina-success,#00852d)]"
      : tone === "watch"
        ? "bg-[#fff0d2] text-[#8b4b00]"
        : "bg-tina-subtle text-tina-secondary";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventSummary(event: PrivacyEvent): string {
  if (event.event_type === "purge") {
    return `Deleted ${event.sessions_deleted} expired conversations and ${event.dedup_deleted} duplicate-delivery rows`;
  }
  if (event.event_type === "subject_delete") {
    return `Deleted stored rows for one number (${event.sessions_deleted} conversations)`;
  }
  return event.event_type;
}

export function PrivacyPanel({
  actorEmail,
  retentionDays,
  contactEmail,
  sessionCount,
  sessionsDue,
  dedupDue,
  events,
  documents,
  noticePage,
}: {
  actorEmail: string;
  retentionDays: number;
  contactEmail: string;
  sessionCount: number | null;
  sessionsDue: number;
  dedupDue: number;
  events: PrivacyEvent[];
  documents: PrivacyDocument[];
  noticePage: NoticePage | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  const [days, setDays] = useState(retentionDays);
  const [contact, setContact] = useState(contactEmail);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restricted = documents.filter((doc) => doc.access_class === "restricted").length;

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("agent_config")
      .update({
        retention_days: days,
        privacy_contact_email: contact.trim(),
        updated_at: new Date().toISOString(),
        updated_by: actorEmail,
      })
      .eq("id", 1);
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage("Saved. The public notice shows this period. Deletion runs on the next purge.");
    router.refresh();
  }

  async function callPrivacy(body: Record<string, unknown>) {
    const response = await fetch("/api/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `Request failed (${response.status})`);
    }
    return payload;
  }

  async function purgeNow() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await callPrivacy({ action: "purge" });
      setMessage(
        `Deleted ${result.sessions_deleted ?? 0} sessions and ${result.dedup_deleted ?? 0} dedup rows.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purge failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportPhone() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await callPrivacy({ phone, action: "export" });
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "tina-privacy-export.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function deletePhone() {
    if (!window.confirm("Delete stored WhatsApp rows for this number?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await callPrivacy({ phone, action: "delete" });
      setMessage(
        `Deleted ${result.sessions_deleted ?? 0} sessions and ${result.dedup_deleted ?? 0} dedup rows.`,
      );
      setPhone("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function setClass(id: string, accessClass: string) {
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("documents")
      .update({ access_class: accessClass })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  const noticeStatus = !noticePage
    ? { label: "Built-in copy", tone: "neutral" as const }
    : noticePage.published
      ? { label: "Published", tone: "ok" as const }
      : { label: "Unpublished", tone: "watch" as const };

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Privacy sections" className="flex flex-wrap gap-1 border-b border-tina-border">
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`privacy-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`privacy-panel-${item.id}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                selected ? "border-tina-text text-tina-text" : "border-transparent text-tina-muted"
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-tis-success">{message}</p>
      )}

      {tab === "overview" && (
        <div
          role="tabpanel"
          id="privacy-panel-overview"
          aria-labelledby="privacy-tab-overview"
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Conversations"
              value={sessionCount == null ? "—" : sessionCount}
              detail="Stored in the active database"
              definition="WhatsApp conversations currently stored. This is not a count of parents, and it does not include chats already deleted."
              accent="green"
              iconName="message"
            />
            <StatCard
              label="Retention period"
              value={`${retentionDays} days`}
              detail="Daily cleanup at 04:30 JST"
              definition="Conversation rows older than this are deleted. Documents and knowledge articles stay. The public notice shows this number."
              accent="blue"
              iconName="clock"
            />
            <StatCard
              label="Due for deletion"
              value={sessionsDue}
              detail={
                sessionsDue === 0
                  ? "None are past the retention period"
                  : `${dedupDue} duplicate-delivery rows are also due`
              }
              definition="Conversations whose last message is older than the retention period. Deletion runs on the daily job, or from Data retention."
              accent="amber"
              iconName="alert"
            />
            <StatCard
              label="Restricted documents"
              value={restricted}
              detail="Left out of answers"
              definition="Documents marked Restricted stay in storage and are not sent to the model. Change a document under Knowledge."
              accent="purple"
              iconName="book"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card">
              <h2 className="text-lg font-semibold text-tina-text">Controls</h2>
              <p className="mt-1 text-sm text-tina-muted">What this admin can actually see.</p>
              <ul className="mt-4 divide-y divide-[var(--tina-border,#e9ecf3)]">
                <li className="grid gap-2 py-3 sm:grid-cols-[9rem_7.5rem_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm font-semibold text-tina-text">Who can sign in</p>
                  <StatusPill tone="ok">Invitation only</StatusPill>
                  <p className="text-sm text-tina-muted">
                    An administrator invites each person. Multi-factor sign-in is not tracked here.{" "}
                    <Link href="/users" className="font-semibold text-tina-text underline">
                      Users
                    </Link>
                  </p>
                </li>
                <li className="grid gap-2 py-3 sm:grid-cols-[9rem_7.5rem_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm font-semibold text-tina-text">Conversations</p>
                  <StatusPill tone="ok">Admins only</StatusPill>
                  <p className="text-sm text-tina-muted">
                    Conversation records are not on the public site. Invited staff can read them.
                  </p>
                </li>
                <li className="grid gap-2 py-3 sm:grid-cols-[9rem_7.5rem_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm font-semibold text-tina-text">Retention</p>
                  <StatusPill tone="ok">{retentionDays} days</StatusPill>
                  <p className="text-sm text-tina-muted">
                    Documents stay.{" "}
                    <button
                      type="button"
                      className="font-semibold text-tina-text underline"
                      onClick={() => setTab("retention")}
                    >
                      Change the period
                    </button>
                  </p>
                </li>
                <li className="grid gap-2 py-3 sm:grid-cols-[9rem_7.5rem_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm font-semibold text-tina-text">Outside Japan</p>
                  <StatusPill tone="watch">Singapore and others</StatusPill>
                  <p className="text-sm text-tina-muted">
                    No transfer record is stored on this page. The notice names each service.
                  </p>
                </li>
                <li className="grid gap-2 py-3 sm:grid-cols-[9rem_7.5rem_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm font-semibold text-tina-text">Privacy notice</p>
                  <StatusPill tone={noticeStatus.tone}>{noticeStatus.label}</StatusPill>
                  <p className="text-sm text-tina-muted">
                    {noticePage?.published
                      ? "Parents see the Pages article."
                      : "Parents see the built-in notice until a Pages article is published."}{" "}
                    <Link href="/content" className="font-semibold text-tina-text underline">
                      Edit
                    </Link>
                  </p>
                </li>
                <li className="grid gap-2 py-3 sm:grid-cols-[9rem_7.5rem_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm font-semibold text-tina-text">Knowledge</p>
                  <StatusPill tone="watch">Person reviews</StatusPill>
                  <p className="text-sm text-tina-muted">
                    There is no automatic check that a saved article leaves out a child’s name.{" "}
                    <button
                      type="button"
                      className="font-semibold text-tina-text underline"
                      onClick={() => setTab("knowledge")}
                    >
                      Access classes
                    </button>
                  </p>
                </li>
              </ul>
            </section>

            <section className="card">
              <h2 className="text-lg font-semibold text-tina-text">How information moves</h2>
              <p className="mt-1 text-sm text-tina-muted">The path of a WhatsApp question.</p>
              <ol className="mt-4 space-y-3">
                {FLOW.map((step, index) => (
                  <li key={step.title} className="flex gap-3 rounded-2xl bg-tina-subtle px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-tina-secondary">
                      <step.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-tina-text">
                        {index + 1}. {step.title}
                      </p>
                      <p className="text-sm text-tina-muted">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex gap-3 rounded-2xl border border-[var(--tina-border,#e9ecf3)] px-4 py-3">
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-tina-secondary" strokeWidth={1.75} aria-hidden />
                <p className="text-sm text-tina-muted">
                  <span className="font-semibold text-tina-text">Knowledge sources. </span>
                  Google Drive holds the source documents. Tina Admin holds articles a person writes.
                  An article can start from a question, and that person is expected to keep it general.
                </p>
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ActivityList events={events.slice(0, 5)} onViewAll={() => setTab("activity")} />
            <section className="card">
              <h2 className="text-lg font-semibold text-tina-text">Open items</h2>
              <p className="mt-1 text-sm text-tina-muted">Gaps this page does not close.</p>
              <ul className="mt-4 divide-y divide-[var(--tina-border,#e9ecf3)]">
                {sessionsDue > 0 && (
                  <li className="py-3 text-sm">
                    <p className="font-semibold text-tina-text">
                      {sessionsDue} conversations are past the retention period
                    </p>
                    <button
                      type="button"
                      className="mt-1 font-semibold text-tina-text underline"
                      onClick={() => setTab("retention")}
                    >
                      Review deletion
                    </button>
                  </li>
                )}
                <li className="py-3 text-sm">
                  <p className="font-semibold text-tina-text">Transfers outside Japan</p>
                  <p className="mt-1 text-tina-muted">
                    Singapore, OpenAI, and Vercel handle parts of a message. This page does not store a
                    completed transfer arrangement.
                  </p>
                </li>
                <li className="py-3 text-sm">
                  <p className="font-semibold text-tina-text">Knowledge articles</p>
                  <p className="mt-1 text-tina-muted">
                    A saved article is not automatically screened before it is kept.
                  </p>
                </li>
                <li className="py-3 text-sm">
                  <p className="font-semibold text-tina-text">Activity is partial</p>
                  <p className="mt-1 text-tina-muted">
                    The list records purges and deletions of a number. It does not record who opened a
                    conversation.
                  </p>
                </li>
              </ul>
            </section>
          </div>
        </div>
      )}

      {tab === "retention" && (
        <form
          role="tabpanel"
          id="privacy-panel-retention"
          aria-labelledby="privacy-tab-retention"
          onSubmit={saveSettings}
          className="card space-y-4"
        >
          <div>
            <h2 className="text-lg font-semibold text-tina-text">Data retention</h2>
            <p className="mt-1 text-sm text-tina-muted">
              Conversation rows older than this are deleted. Documents and knowledge articles stay.
              The public notice shows the saved period.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                className={period === days ? "primary" : "secondary"}
                onClick={() => setDays(period)}
              >
                {period} days
              </button>
            ))}
          </div>
          <div>
            <label className="label" htmlFor="privacy-contact">
              Contact email on the notice
            </label>
            <input
              id="privacy-contact"
              type="email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <p className="text-sm text-tina-muted">
            {sessionsDue} conversations and {dedupDue} duplicate-delivery rows are older than {days}{" "}
            days. The daily job runs at 04:30 Japan time.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="primary" disabled={busy}>
              Save
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={purgeNow}>
              Delete expired records now
            </button>
          </div>
        </form>
      )}

      {tab === "requests" && (
        <section
          role="tabpanel"
          id="privacy-panel-requests"
          aria-labelledby="privacy-tab-requests"
          className="card space-y-4"
        >
          <h2 className="text-lg font-semibold text-tina-text">Data requests</h2>
          <p className="text-sm text-tina-muted">
            Export or delete the stored rows for one WhatsApp number. This does not delete the chat
            on their phone, or copies held by other providers.
          </p>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="8190…"
            aria-label="WhatsApp number"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="secondary" disabled={busy || !phone.trim()} onClick={exportPhone}>
              Export JSON
            </button>
            <button type="button" className="secondary" disabled={busy || !phone.trim()} onClick={deletePhone}>
              Delete this number
            </button>
          </div>
        </section>
      )}

      {tab === "knowledge" && (
        <section
          role="tabpanel"
          id="privacy-panel-knowledge"
          aria-labelledby="privacy-tab-knowledge"
          className="card"
        >
          <h2 className="text-lg font-semibold text-tina-text">Knowledge access</h2>
          <p className="mt-1 text-sm text-tina-muted">
            Restricted documents are not sent to the model. Parents only is the default.{" "}
            {restricted} of {documents.length} are restricted.
          </p>
          <ul className="mt-4 divide-y divide-[var(--tina-border,#e9ecf3)]">
            {documents.length === 0 && (
              <li className="py-3 text-sm text-tina-muted">No documents are stored.</li>
            )}
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-tina-text">{doc.title}</p>
                  <p className="text-xs text-tina-muted">{doc.source_type || "document"}</p>
                </div>
                <select
                  className="rounded-xl border border-[var(--tina-border,#e9ecf3)] bg-white px-3 py-2 text-sm"
                  value={doc.access_class}
                  aria-label={`Access for ${doc.title}`}
                  onChange={(e) => setClass(doc.id, e.target.value)}
                >
                  <option value="public">Public</option>
                  <option value="parents_only">Parents only</option>
                  <option value="restricted">Restricted</option>
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "activity" && (
        <div role="tabpanel" id="privacy-panel-activity" aria-labelledby="privacy-tab-activity">
          <ActivityList events={events} />
        </div>
      )}
    </div>
  );
}

function ActivityList({
  events,
  onViewAll,
}: {
  events: PrivacyEvent[];
  onViewAll?: () => void;
}) {
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-tina-text">Activity</h2>
          <p className="mt-1 text-sm text-tina-muted">Purges and deletions of one number. Times are Japan time.</p>
        </div>
        {onViewAll && (
          <button type="button" className="text-sm font-semibold text-tina-text underline" onClick={onViewAll}>
            View all
          </button>
        )}
      </div>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-tina-muted">No purges or deletions yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--tina-border,#e9ecf3)]">
          {events.map((event) => (
            <li key={event.id} className="py-3 text-sm">
              <p className="font-semibold text-tina-text">{eventSummary(event)}</p>
              <p className="text-tina-muted">
                {formatWhen(event.created_at)} · {event.actor}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
