"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PERIODS = [30, 90, 180, 365] as const;

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

export function PrivacyPanel({
  actorEmail,
  retentionDays,
  contactEmail,
  sessionsDue,
  dedupDue,
  events,
  documents,
}: {
  actorEmail: string;
  retentionDays: number;
  contactEmail: string;
  sessionsDue: number;
  dedupDue: number;
  events: PrivacyEvent[];
  documents: PrivacyDocument[];
}) {
  const router = useRouter();
  const [days, setDays] = useState(retentionDays);
  const [contact, setContact] = useState(contactEmail);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      if (result) {
        setMessage(
          `Deleted ${result.sessions_deleted ?? 0} sessions and ${result.dedup_deleted ?? 0} dedup rows.`,
        );
        router.refresh();
      }
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
      if (!result) return;
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
      if (result) {
        setMessage(
          `Deleted ${result.sessions_deleted ?? 0} sessions and ${result.dedup_deleted ?? 0} dedup rows.`,
        );
        setPhone("");
        router.refresh();
      }
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

  return (
    <div className="space-y-6">
      <form onSubmit={saveSettings} className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Retention</h2>
          <p className="mt-1 text-sm text-tis-muted">
            Conversation rows older than this are deleted. Documents stay.{" "}
            <a href="/privacy" className="font-semibold text-tis-navy underline">
              Public notice
            </a>
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
        <p className="text-sm text-tis-muted">
          {sessionsDue} sessions and {dedupDue} dedup rows are older than {days} days.
        </p>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>}
        {message && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-tis-success">
            {message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="primary" disabled={busy}>
            Save
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={purgeNow}>
            Delete expired records now
          </button>
        </div>
      </form>

      <section className="card space-y-4">
        <h2 className="text-lg font-bold text-tis-navy">One parent</h2>
        <p className="text-sm text-tis-muted">
          Export or delete the stored rows for a WhatsApp number. This does not delete the chat on
          their phone.
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

      <section className="card">
        <h2 className="text-lg font-bold text-tis-navy">Recent privacy events</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-tis-muted">No purges or deletions yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {events.map((event) => (
              <li key={event.id} className="py-3 text-sm">
                <p className="font-semibold text-tis-navy">
                  {event.event_type} · {event.sessions_deleted} sessions · {event.dedup_deleted} dedup
                </p>
                <p className="text-tis-muted">
                  {new Date(event.created_at).toLocaleString()} · {event.actor}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold text-tis-navy">Knowledge access</h2>
        <p className="mt-1 text-sm text-tis-muted">
          Restricted documents are not sent to the model. Parents only is the default.
        </p>
        <ul className="mt-4 divide-y divide-slate-100">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold text-tis-navy">{doc.title}</p>
                <p className="text-xs text-tis-muted">{doc.source_type || "document"}</p>
              </div>
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
    </div>
  );
}
