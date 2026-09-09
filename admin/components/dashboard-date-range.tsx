"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function DashboardDateRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(nextFrom: string, nextTo: string) {
    let start = nextFrom;
    let end = nextTo;
    if (start && end && start > end) {
      const swap = start;
      start = end;
      end = swap;
    }
    const params = new URLSearchParams();
    if (start) params.set("from", start);
    if (end) params.set("to", end);
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""}`}
      aria-busy={pending}
    >
      <label className="flex items-center gap-1.5 text-xs font-semibold text-tis-muted">
        <span className="sr-only">From date</span>
        <input
          type="date"
          value={from}
          max={to}
          aria-label="From date"
          className="!w-auto !rounded-xl !px-3 !py-2 !text-xs !font-semibold !text-tis-navy"
          onChange={(e) => apply(e.target.value, to)}
        />
      </label>
      <span className="text-xs font-semibold text-tis-muted" aria-hidden>
        to
      </span>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-tis-muted">
        <span className="sr-only">To date</span>
        <input
          type="date"
          value={to}
          min={from}
          aria-label="To date"
          className="!w-auto !rounded-xl !px-3 !py-2 !text-xs !font-semibold !text-tis-navy"
          onChange={(e) => apply(from, e.target.value)}
        />
      </label>
    </div>
  );
}
