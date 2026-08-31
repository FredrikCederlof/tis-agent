"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createSuccessPath } from "@/lib/knowledge-hub";
import type { KnowledgeEntry } from "@/lib/types";

type RelatedHit = {
  title?: string;
  similarity?: number;
  content?: string;
};

const RELATED_WARN_AT = 0.68;

export function KnowledgeEditor({
  entry,
  initialQuestion = "",
  origin,
  originInteractionId,
  userEmail,
  apiUrl,
  syncSecret,
}: {
  entry?: KnowledgeEntry;
  initialQuestion?: string;
  origin: "manual" | "inbox";
  originInteractionId?: string | null;
  userEmail: string;
  apiUrl: string;
  syncSecret: string;
}) {
  const router = useRouter();
  const [primaryQuestion, setPrimaryQuestion] = useState(
    entry?.primary_question || initialQuestion,
  );
  const [similarQuestions, setSimilarQuestions] = useState<string[]>(
    entry?.similar_questions?.length ? entry.similar_questions : [""],
  );
  const [answer, setAnswer] = useState(entry?.answer || "");
  const [tags, setTags] = useState((entry?.tags || []).join(", "));
  const [category, setCategory] = useState(entry?.category || "");
  const [sourceNote, setSourceNote] = useState(entry?.source_note || "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<RelatedHit[] | null>(null);
  const [checkingRelated, setCheckingRelated] = useState(false);

  const isNew = !entry;
  const archived = entry?.status === "archived";
  const configured = Boolean(apiUrl && syncSecret);
  const relatedHits = useMemo(
    () => (related || []).filter((hit) => (hit.similarity ?? 0) >= RELATED_WARN_AT),
    [related],
  );

  function updateSimilar(index: number, value: string) {
    setSimilarQuestions((current) => current.map((item, i) => (i === index ? value : item)));
  }

  async function checkRelated() {
    if (!isNew || !configured || !primaryQuestion.trim()) {
      setRelated([]);
      return true;
    }
    setCheckingRelated(true);
    try {
      const url = new URL(`${apiUrl.replace(/\/$/, "")}/admin/knowledge/related`);
      url.searchParams.set("q", primaryQuestion.trim());
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${syncSecret}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Related check failed (${response.status})`);
      }
      setRelated(body.results || []);
    } catch (err) {
      setRelated([]);
      console.warn(err);
    } finally {
      setCheckingRelated(false);
    }
    return true;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) {
      setError(
        "Knowledge Hub save is not configured. Set NEXT_PUBLIC_TINA_API_URL and ADMIN_SYNC_SECRET.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await checkRelated();
      const payload = {
        primary_question: primaryQuestion.trim(),
        similar_questions: similarQuestions.map((q) => q.trim()).filter(Boolean),
        answer: answer.trim(),
        category: category.trim(),
        tags,
        source_note: sourceNote.trim(),
        origin,
        origin_interaction_id: originInteractionId || undefined,
        updated_by: userEmail,
      };
      const path = entry
        ? `${apiUrl.replace(/\/$/, "")}/admin/knowledge/${entry.id}`
        : `${apiUrl.replace(/\/$/, "")}/admin/knowledge`;
      const response = await fetch(path, {
        method: entry ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${syncSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Save failed (${response.status})`);
      }
      const next = createSuccessPath(isNew);
      if (next) {
        router.push(next);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onArchive() {
    if (!entry || !configured) return;
    if (!window.confirm("Archive this entry? Tina will stop using it; the Hub row stays for history.")) {
      return;
    }
    setArchiving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/admin/knowledge/${entry.id}/archive`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${syncSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ updated_by: userEmail }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Archive failed (${response.status})`);
      }
      router.push("/knowledge");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <form className="card space-y-5" onSubmit={onSave}>
      {origin === "inbox" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Started from an unanswered inbox question. Saving marks that row reviewed and
          links it to this entry.
        </p>
      )}
      {archived && (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-tis-muted">
          This entry is archived. Saving again re-ingests it into Tina’s knowledge store.
        </p>
      )}

      <label className="block">
        <span className="label">Primary question</span>
        <input
          type="text"
          required
          value={primaryQuestion}
          onChange={(e) => setPrimaryQuestion(e.target.value)}
          onBlur={() => {
            if (isNew) void checkRelated();
          }}
          placeholder="When does Grade 6 finish on Friday?"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="label">Similar questions</legend>
        <p className="hint !mt-0">
          Optional phrasings parents might use. They stay on this one document — not separate
          answers.
        </p>
        {similarQuestions.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => updateSimilar(index, e.target.value)}
              placeholder="What time does G6 finish on Fridays?"
            />
            <button
              type="button"
              className="secondary shrink-0"
              onClick={() =>
                setSimilarQuestions((current) =>
                  current.length === 1 ? [""] : current.filter((_, i) => i !== index),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setSimilarQuestions((current) => [...current, ""])}
        >
          Add similar question
        </button>
      </fieldset>

      <label className="block">
        <span className="label">Verified answer</span>
        <textarea
          required
          rows={6}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Grade 6 finishes at 2:30pm on Fridays."
        />
      </label>

      <label className="block">
        <span className="label">Category</span>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="School hours"
        />
        <p className="hint">
          Optional. When the Hub has more than 100 active entries, the start page groups by
          category.
        </p>
      </label>

      <label className="block">
        <span className="label">Tags</span>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="dismissal, grade 6"
        />
        <p className="hint">Comma-separated. Used for filtering in the Hub list.</p>
      </label>

      <label className="block">
        <span className="label">Source note</span>
        <input
          type="text"
          value={sourceNote}
          onChange={(e) => setSourceNote(e.target.value)}
          placeholder="Confirmed with TIS office, Aug 2026"
        />
      </label>

      {checkingRelated && (
        <p className="text-sm text-tis-muted">Checking for related Hub entries…</p>
      )}
      {relatedHits.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p className="font-semibold">Possible duplicate</p>
          <p className="mt-1">
            A similar Knowledge Hub entry already exists. Edit that one instead of creating
            another document with the same answer.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {relatedHits.map((hit, index) => (
              <li key={`${hit.title || "related"}-${index}`}>
                {(hit.title || "Existing entry") +
                  (hit.similarity != null
                    ? ` (${Math.round(hit.similarity * 100)}% similar)`
                    : "")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="primary" disabled={saving || archiving}>
          {saving ? "Saving…" : isNew ? "Add to Knowledge Hub" : "Save and re-ingest"}
        </button>
        {entry && !archived && (
          <button
            type="button"
            className="secondary"
            disabled={saving || archiving}
            onClick={() => void onArchive()}
          >
            {archiving ? "Archiving…" : "Archive"}
          </button>
        )}
      </div>
    </form>
  );
}
