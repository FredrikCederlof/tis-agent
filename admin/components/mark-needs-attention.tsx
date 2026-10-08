"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";

type Fly = { left: number; top: number; dx: number; dy: number };

/**
 * Marks the latest question for Needs attention, then sends a chip into the
 * sidebar inbox so the add is visible.
 */
export function MarkNeedsAttentionButton({
  flagged,
  flagging,
  onMark,
}: {
  flagged: boolean;
  flagging: boolean;
  onMark: () => Promise<boolean>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!flagged) setJustAdded(false);
  }, [flagged]);

  useEffect(() => {
    if (!fly) return;
    const timer = window.setTimeout(() => setFly(null), 240);
    return () => window.clearTimeout(timer);
  }, [fly]);

  function launchFly(rect: DOMRect) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const inbox = document.querySelector<HTMLElement>("[data-nav-inbox]");
    const target = inbox?.getBoundingClientRect();
    if (!inbox || !target || target.width <= 0 || target.height <= 0) return;
    inbox.classList.remove("attention-land");
    void inbox.offsetWidth;
    inbox.classList.add("attention-land");
    window.setTimeout(() => inbox.classList.remove("attention-land"), 240);
    setFly({
      left: rect.left + rect.width / 2,
      top: rect.top + rect.height / 2,
      dx: target.left + target.width / 2 - (rect.left + rect.width / 2),
      dy: target.top + target.height / 2 - (rect.top + rect.height / 2),
    });
  }

  function onClick() {
    const rect = buttonRef.current?.getBoundingClientRect();
    setJustAdded(true);
    window.dispatchEvent(new CustomEvent("tina-needs-attention-added"));
    if (rect) launchFly(rect);
    void onMark().then((ok) => {
      if (ok) return;
      setJustAdded(false);
      setFly(null);
      window.dispatchEvent(new CustomEvent("tina-needs-attention-reverted"));
    });
  }

  return (
    <>
      {flagged || justAdded ? (
        <div
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] font-semibold text-amber-950 ${
            justAdded ? "attention-added" : ""
          }`}
          role="status"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Added to Needs attention
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className="primary w-full justify-center !text-[13px]"
          disabled={flagging}
          aria-disabled={flagging}
          onClick={onClick}
        >
          <AlertCircle className="h-4 w-4" aria-hidden />
          Mark as Needs attention
        </button>
      )}
      {fly
        ? createPortal(
            <span
              className="attention-fly pointer-events-none fixed z-[80] inline-flex items-center gap-1.5 rounded-full bg-tis-acid px-3 py-1.5 text-[12px] font-bold text-tis-ink shadow-card"
              style={{
                left: fly.left,
                top: fly.top,
                ["--dx" as string]: `${fly.dx}px`,
                ["--dy" as string]: `${fly.dy}px`,
              }}
            >
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              Needs attention
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
