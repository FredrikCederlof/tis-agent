import { Info } from "lucide-react";

export function InfoTip({ label, children }: { label: string; children: string }) {
  const id = `metric-def-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="peer inline-flex rounded-full p-0.5 text-slate-400 transition hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tis-sky"
        aria-label={`${label} definition`}
        aria-describedby={id}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-[calc(100%+8px)] z-50 w-64 rounded-lg bg-tis-ink px-3 py-2 text-left text-xs font-medium leading-relaxed text-white opacity-0 shadow-soft transition-opacity peer-hover:visible peer-hover:opacity-100 peer-focus:visible peer-focus:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
