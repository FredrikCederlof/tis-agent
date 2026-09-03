"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { knowledgeHubUrl, type KnowledgeCandidate } from "@/lib/knowledge-questions";

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Pick one parent question from a session before opening the Knowledge Hub form. */
export function KnowledgeQuestionPicker({
  open,
  candidates,
  onClose,
}: {
  open: boolean;
  candidates: KnowledgeCandidate[];
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setSelectedId(candidates[0]?.id || "");
  }, [candidates, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;

  function continueToHub() {
    if (!selectedId) return;
    const chosen = candidates.find((row) => row.id === selectedId);
    router.push(knowledgeHubUrl(selectedId, { answer: chosen?.reply }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tis-ink/40 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close question picker"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold text-tis-navy">
            Add question to Knowledge Hub
          </h2>
          <p className="mt-1 text-sm text-tis-muted">
            Select a question from this session and create a knowledge entry.
          </p>
        </div>

        <div className="max-h-[min(24rem,55vh)] overflow-y-auto px-3 py-3">
          {candidates.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-tis-muted">
              This session has no parent questions that would make a useful Knowledge Hub entry.
              Greetings and short acknowledgements are left out.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {candidates.map((row) => {
                const active = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <label
                      className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition ${
                        active
                          ? "border-tis-sky bg-tis-mist"
                          : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="knowledge-question"
                        className="mt-1"
                        checked={active}
                        onChange={() => setSelectedId(row.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-tis-navy">
                          {row.question}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {timeOnly(row.created_at)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!selectedId || candidates.length === 0}
            onClick={continueToHub}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
