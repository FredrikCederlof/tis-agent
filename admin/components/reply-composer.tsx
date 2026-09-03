"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, BookPlus, Clock, Send } from "lucide-react";
import { clearDraft, loadDraft, replyWindow, saveDraft } from "@/lib/reply";

/** Human in the loop: answer the parent in the same WhatsApp conversation. */
export function ReplyComposer({
  interactionId,
  question,
  lastInboundAt,
  answeredAt,
  answeredBy,
  compact = false,
}: {
  interactionId: string;
  question: string;
  lastInboundAt: string | null;
  answeredAt?: string | null;
  answeredBy?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(answeredAt || null);
  const [window_, setWindow] = useState(() => replyWindow(lastInboundAt));

  useEffect(() => {
    setBody(loadDraft(interactionId));
  }, [interactionId]);

  useEffect(() => {
    setWindow(replyWindow(lastInboundAt));
    const timer = setInterval(() => setWindow(replyWindow(lastInboundAt)), 60_000);
    return () => clearInterval(timer);
  }, [lastInboundAt]);

  function updateBody(value: string) {
    setBody(value);
    saveDraft(interactionId, value);
  }

  async function send(alsoAddToKnowledge: boolean) {
    const answer = body.trim();
    if (!answer) {
      setError("Write an answer before sending.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interaction_id: interactionId, body: answer }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || `Sending failed (${response.status})`);
      }
      // Draft is only dropped once WhatsApp accepted the message.
      clearDraft(interactionId);
      setSentAt(result.answered_at || new Date().toISOString());
      setBody("");
      if (alsoAddToKnowledge) {
        const url = new URL("/knowledge/new", globalThis.location.origin);
        url.searchParams.set("from", interactionId);
        url.searchParams.set("answer", answer);
        router.push(`${url.pathname}${url.search}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sending failed");
    } finally {
      setSending(false);
    }
  }

  if (sentAt) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">
        <p className="font-semibold">Answered by a human</p>
        <p className="mt-0.5 text-emerald-800">
          Sent {new Date(sentAt).toLocaleString()}
          {answeredBy ? ` by ${answeredBy}` : ""}. This question no longer needs attention.
        </p>
      </div>
    );
  }

  const expired = !window_.open;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            expired
              ? "bg-amber-50 text-amber-800"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {expired ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
          {window_.label}
        </span>
        {!compact && (
          <span className="text-xs text-tis-muted">
            Your reply arrives in the parent’s existing Tina conversation.
          </span>
        )}
      </div>

      {expired ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          WhatsApp only allows a free-form reply within 24 hours of the parent’s last
          message, so Tina cannot send this answer. Add it to the Knowledge Hub instead —
          Tina will use it the next time a parent asks.
        </p>
      ) : (
        <>
          <textarea
            rows={compact ? 2 : 4}
            className={compact ? "!rounded-2xl !border-slate-100 !bg-slate-50" : ""}
            value={body}
            onChange={(e) => updateBody(e.target.value)}
            placeholder={`Answer “${question.slice(0, 60)}${question.length > 60 ? "…" : ""}”`}
            aria-label="Reply to parent"
          />
          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              {error} Your draft is kept — you can try again.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="primary"
              disabled={sending}
              onClick={() => void send(false)}
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : error ? "Retry send" : "Send reply"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={sending}
              onClick={() => void send(true)}
            >
              <BookPlus className="h-4 w-4" />
              Send + Add to Knowledge
            </button>
          </div>
          <p className="text-xs text-tis-muted">
            “Send + Add to Knowledge” sends the reply, then opens the Knowledge Hub form with
            this question and answer for review before Tina uses it.
          </p>
        </>
      )}
    </div>
  );
}
