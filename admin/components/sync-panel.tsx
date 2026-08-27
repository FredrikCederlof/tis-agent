"use client";

import { useState } from "react";

type SyncResult = {
  title: string;
  url: string;
  status: string;
  chunks: number;
  pages_fetched?: number;
};

type DocumentRow = {
  title: string;
  source_type: string | null;
  drive_modified_time: string | null;
  created_at: string;
};

export function SyncPanel({
  documents,
  apiUrl,
  syncSecret,
}: {
  documents: DocumentRow[];
  apiUrl: string;
  syncSecret: string;
}) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runWebSync() {
    if (!apiUrl || !syncSecret) {
      setError("Sync is not configured. Set NEXT_PUBLIC_TINA_API_URL and ADMIN_SYNC_SECRET.");
      return;
    }
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/admin/sync/web`, {
        method: "POST",
        headers: { Authorization: `Bearer ${syncSecret}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Sync failed (${response.status})`);
      }
      setResults(body.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-tis-navy">Sync knowledge sources</h3>
        <p className="text-sm text-slate-600">
          Re-fetch the public IT portal (Google Sites), parent calendar (iCal), and school
          uniform page into Supabase. Run this after the school updates the calendar or web
          pages. Drive PDFs/Docs still sync via the nightly Cloud Agent.
        </p>
        <button type="button" className="primary" disabled={running} onClick={runWebSync}>
          {running ? "Syncing… (may take 1–2 minutes)" : "Sync web & calendar now"}
        </button>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {results && (
          <ul className="space-y-2 text-sm">
            {results.map((r) => (
              <li key={r.url} className="rounded-lg border border-slate-200 px-3 py-2">
                <span className="font-medium">{r.title}</span>
                {" — "}
                <span className={r.status === "failed" ? "text-red-600" : "text-green-700"}>
                  {r.status}
                </span>
                {r.status === "synced" && (
                  <span className="text-slate-500">
                    {" "}
                    ({r.chunks} chunks{r.pages_fetched ? `, ${r.pages_fetched} pages` : ""})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h3 className="text-lg font-semibold text-tis-navy">Indexed documents</h3>
        <p className="text-sm text-slate-600">
          {documents.length} documents in Supabase (Drive + web sources).
        </p>
        <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
          {documents.map((doc) => (
            <li key={doc.title + doc.created_at} className="border-b border-slate-100 pb-2">
              <span className="font-medium">{doc.title}</span>
              {doc.source_type && (
                <span className="text-slate-500"> · {doc.source_type}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
