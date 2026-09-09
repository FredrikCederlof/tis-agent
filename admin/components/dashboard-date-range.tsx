"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { formatRangeLabel } from "@/lib/dashboard";
import "react-day-picker/style.css";

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DashboardDateRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: parseYmd(from),
    to: parseYmd(to),
  }));

  useEffect(() => {
    setDraft({ from: parseYmd(from), to: parseYmd(to) });
  }, [from, to]);

  useEffect(() => {
    if (!open) return;
    function resetDraft() {
      setDraft({ from: parseYmd(from), to: parseYmd(to) });
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        resetDraft();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        resetDraft();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, from, to]);

  function applyRange(range: DateRange | undefined) {
    if (!range?.from || !range?.to) return;
    let start = toYmd(range.from);
    let end = toYmd(range.to);
    if (start > end) {
      const swap = start;
      start = end;
      end = swap;
    }
    const params = new URLSearchParams({ from: start, to: end });
    setOpen(false);
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  }

  const label = formatRangeLabel(from, to);
  const canApply = Boolean(draft?.from && draft?.to);

  return (
    <div ref={rootRef} className={`relative ${pending ? "opacity-70" : ""}`}>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-tis-navy shadow-sm transition hover:bg-tis-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tis-navy"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={`Date range ${label}. Open calendar to change.`}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarDays className="h-3.5 w-3.5 text-tis-muted" aria-hidden />
        <span>{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-tis-muted transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose date range"
          className="absolute right-0 z-40 mt-2 w-[min(20.5rem,calc(100vw-2rem))] rounded-2xl border border-black/[0.08] bg-white p-3 shadow-soft"
        >
          <p className="mb-2 px-1 text-xs font-semibold text-tis-muted">
            Pick a start date, then an end date
          </p>
          <DayPicker
            mode="range"
            selected={draft}
            onSelect={setDraft}
            numberOfMonths={1}
            defaultMonth={draft?.from ?? parseYmd(from)}
            disabled={{ after: new Date() }}
            className="tis-day-picker !m-0"
          />
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
            <button
              type="button"
              className="secondary !px-3 !py-1.5 !text-xs"
              onClick={() => {
                setOpen(false);
                setDraft({ from: parseYmd(from), to: parseYmd(to) });
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary !px-3 !py-1.5 !text-xs"
              disabled={!canApply}
              onClick={() => applyRange(draft)}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
