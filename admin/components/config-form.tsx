"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentConfigRow } from "@/lib/types";

const DEFAULT_GREETING =
  "Hi! I'm Tina. What can I help you with today?\n" +
  "I answer from official TIS information — calendar, absences, school times, and more.";

const DEFAULT_FALLBACKS = [
  "I don't have enough verified TIS information to answer that confidently.",
  "I wasn't able to confirm that from the TIS information I have access to.",
  "I can't find a clear answer to that in the available TIS information.",
  "It looks like this isn't covered in the TIS information currently available to me.",
  "I couldn't verify this from the available TIS information.",
  "I don't have a reliable TIS source for that yet. Feel free to rephrase or add a bit more detail.",
  "I'm not seeing anything in the TIS information that clearly answers this.",
  "That one doesn't seem to be covered clearly in the information I have.",
];

function messagesToTextarea(raw: unknown, legacy?: string | null): string {
  const lines: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const text = String(item ?? "")
        .replace(/\n\nSource:\s*none found\.?\s*$/i, "")
        .trim();
      if (text) lines.push(text);
    }
  } else if (raw && typeof raw === "object" && Array.isArray((raw as { en?: unknown }).en)) {
    return messagesToTextarea((raw as { en: unknown[] }).en, legacy);
  }
  if (!lines.length && legacy) {
    const cleaned = legacy.replace(/\n\nSource:\s*none found\.?\s*$/i, "").trim();
    if (cleaned) lines.push(cleaned);
  }
  if (!lines.length) return DEFAULT_FALLBACKS.join("\n");
  return lines.join("\n");
}

function textareaToMessages(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

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
    String(config.similarity_threshold ?? 0.4),
  );
  const [greetingMessage, setGreetingMessage] = useState(
    (config.greeting_message || "").trim() || DEFAULT_GREETING,
  );
  const [noEvidenceMessages, setNoEvidenceMessages] = useState(
    messagesToTextarea(config.no_evidence_messages, config.no_evidence_message),
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

    const fallbacks = textareaToMessages(noEvidenceMessages);
    if (!fallbacks.length) {
      setError("Add at least one fallback message (one per line).");
      setSaving(false);
      return;
    }

    const greeting = greetingMessage.trim();
    if (!greeting) {
      setError("Greeting reply cannot be empty.");
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
        greeting_message: greeting,
        no_evidence_messages: fallbacks,
        no_evidence_message: fallbacks[0],
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
        <h3 className="text-lg font-bold text-tis-navy">Answer policy</h3>
        <p className="text-sm text-tis-muted">
          Control when Tina is allowed to answer. With strict grounding on, she only answers
          school questions when official TIS documents match above the threshold — otherwise
          she uses a fallback message from the list below. The system prompt further requires
          quote-backed facts so she does not invent who attends meetings, fees, or other details.
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
          <p className="hint">
            Default 0.40. Higher = stricter (fewer answers). Real TIS matches often score
            0.40–0.65.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="greeting">
            Greeting reply (Hello / Hi)
          </label>
          <textarea
            id="greeting"
            rows={3}
            value={greetingMessage}
            onChange={(e) => setGreetingMessage(e.target.value)}
          />
          <p className="hint">
            Used for short greetings and thanks. Does not search school documents.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="no-evidence">
            Fallback messages when no official source found
          </label>
          <textarea
            id="no-evidence"
            rows={10}
            value={noEvidenceMessages}
            onChange={(e) => setNoEvidenceMessages(e.target.value)}
            className="font-mono text-xs"
          />
          <p className="hint">
            One message per line. Tina picks among these after normal search finishes, and
            avoids repeating the same line twice in a row. Keep them short and parent-focused —
            no technical jargon. Do not invent answers here.
          </p>
        </div>
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-bold text-tis-navy">System prompt</h3>
        <p className="text-sm text-tis-muted">
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
        <h3 className="text-lg font-bold text-tis-navy">Fixed answers</h3>
        <p className="text-sm text-tis-muted">
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
