"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentConfigRow } from "@/lib/types";

export function ConfigForm({
  config,
  userEmail,
}: {
  config: AgentConfigRow;
  userEmail: string;
}) {
  const router = useRouter();
  const [systemPrompt, setSystemPrompt] = useState(config.system_prompt);
  const [fixedAnswersJson, setFixedAnswersJson] = useState(
    JSON.stringify(config.fixed_answers, null, 2),
  );
  const [strictGrounding, setStrictGrounding] = useState(config.strict_grounding ?? true);
  const [similarityThreshold, setSimilarityThreshold] = useState(
    String(config.similarity_threshold ?? 0.72),
  );
  const [noEvidenceMessage, setNoEvidenceMessage] = useState(
    config.no_evidence_message ??
      "I couldn't find an official TIS source that answers that.\n\nSource: none found.",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    let fixedAnswers: unknown;
    try {
      fixedAnswers = JSON.parse(fixedAnswersJson);
    } catch {
      setError("Fixed answers must be valid JSON.");
      setSaving(false);
      return;
    }

    const threshold = parseFloat(similarityThreshold);
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
      setError("Similarity threshold must be between 0 and 1.");
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("agent_config")
      .update({
        system_prompt: systemPrompt,
        fixed_answers: fixedAnswers,
        strict_grounding: strictGrounding,
        similarity_threshold: threshold,
        no_evidence_message: noEvidenceMessage,
        updated_at: new Date().toISOString(),
        updated_by: userEmail,
      })
      .eq("id", 1);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Saved. Tina will pick up changes within about a minute.");
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="space-y-8">
      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-tis-navy">Answer policy</h3>
        <p className="text-sm text-slate-600">
          Control when Tina is allowed to answer. With strict grounding on, she only answers
          school questions when official TIS documents match above the threshold — otherwise
          she sends the message below.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={strictGrounding}
            onChange={(e) => setStrictGrounding(e.target.checked)}
            className="h-4 w-4"
          />
          Strict grounding — do not guess when knowledge is weak or missing
        </label>
        <div>
          <label className="label" htmlFor="threshold">
            Similarity threshold
          </label>
          <input
            id="threshold"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={similarityThreshold}
            onChange={(e) => setSimilarityThreshold(e.target.value)}
          />
          <p className="hint">Default 0.72. Higher = stricter (fewer answers).</p>
        </div>
        <div>
          <label className="label" htmlFor="no-evidence">
            Message when no official source found
          </label>
          <textarea
            id="no-evidence"
            rows={4}
            value={noEvidenceMessage}
            onChange={(e) => setNoEvidenceMessage(e.target.value)}
          />
        </div>
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-tis-navy">System prompt</h3>
        <p className="text-sm text-slate-600">
          Instructions for RAG answers. Keep the {"{today}"} placeholder for the current date.
        </p>
        <textarea
          rows={14}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="font-mono text-xs"
        />
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-tis-navy">Fixed answers</h3>
        <p className="text-sm text-slate-600">
          JSON array of rules for meta questions (e.g. who is Tina). Each entry needs{" "}
          <code className="rounded bg-slate-100 px-1">key</code>,{" "}
          <code className="rounded bg-slate-100 px-1">patterns</code>, and{" "}
          <code className="rounded bg-slate-100 px-1">en</code>.
        </p>
        <textarea
          rows={16}
          value={fixedAnswersJson}
          onChange={(e) => setFixedAnswersJson(e.target.value)}
          className="font-mono text-xs"
        />
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {message && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
      )}

      <button type="submit" className="primary" disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
