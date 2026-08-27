"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

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
      setError(
        "Sync is not configured. Set NEXT_PUBLIC_TINA_API_URL and ADMIN_SYNC_SECRET in admin/.env.local, then restart the admin server.",
      );
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
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-tis-navy">Sync knowledge sources</h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-tis-muted">
              Re-fetch the public IT portal (Google Sites), parent calendar (iCal), and school
              uniform page into Supabase. Drive PDFs still sync via the nightly Cloud Agent.
            </p>
          </div>
          <button type="button" className="primary shrink-0" disabled={running} onClick={runWebSync}>
            <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Syncing…" : "Sync web & calendar"}
          </button>
        </div>
        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>
        )}
        {results && (
          <ul className="space-y-2 text-sm">
            {results.map((r) => (
              <li
                key={r.url}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
              >
                <span className="font-semibold text-tis-navy">{r.title}</span>
                {" — "}
                <span className={r.status === "failed" ? "text-tis-danger" : "text-tis-success"}>
                  {r.status}
                </span>
                {r.status === "synced" && (
                  <span className="text-tis-muted">
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
        <h3 className="text-lg font-bold text-tis-navy">Indexed documents</h3>
        <p className="text-sm text-tis-muted">
          {documents.length} documents in Supabase (Drive + web sources).
        </p>
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {documents.map((doc) => (
            <li
              key={doc.title + doc.created_at}
              className="flex flex-col gap-1 rounded-xl border border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-tis-navy">{doc.title}</span>
              {doc.source_type && (
                <span className="rounded-full bg-tis-mist px-2.5 py-0.5 text-xs font-semibold text-tis-sky">
                  {doc.source_type}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
