import { Globe } from "lucide-react";
import { languageInfo } from "@/lib/language-display";

export function LanguageBadge({
  language,
  size = "md",
}: {
  language: string | null | undefined;
  size?: "sm" | "md";
}) {
  const info = languageInfo(language);
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white font-bold uppercase tracking-wide text-tis-navy ${pad}`}
      aria-label={info.name}
      title={info.name}
    >
      {info.flag ? (
        <span aria-hidden className="text-[12px] leading-none">
          {info.flag}
        </span>
      ) : (
        <Globe className="h-3 w-3 text-tis-muted" aria-hidden />
      )}
      {info.code}
    </span>
  );
}
