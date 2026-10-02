"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DEFAULT_UI_THEME,
  normalizeUiTheme,
  UI_THEME_BLURBS,
  UI_THEME_LABELS,
  UI_THEMES,
  type UiTheme,
} from "@/lib/themes";

/** Account settings: choose Green Garden or Lime Licorice (per user). */
export function AccountThemeCard({
  initialTheme = DEFAULT_UI_THEME,
}: {
  initialTheme?: UiTheme | null;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<UiTheme>(normalizeUiTheme(initialTheme));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveTheme(next: UiTheme) {
    if (next === theme || busy) return;
    const previous = theme;
    setTheme(next);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/account/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ui_theme: next }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTheme(previous);
        setError(result.detail || "Could not save theme.");
        return;
      }
      setMessage(result.message || "Theme saved.");
      document.documentElement.setAttribute("data-theme", next);
      router.refresh();
    } catch {
      setTheme(previous);
      setError("Could not save theme.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-bold text-tis-navy">Appearance</h2>
        <p className="mt-1 text-sm text-tis-muted">
          Choose your Admin theme. This only changes how Nabo looks for your account.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {UI_THEMES.map((id) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => void saveTheme(id)}
              aria-pressed={active}
              className={`rounded-2xl border px-4 py-3.5 text-left transition disabled:opacity-60 ${
                active
                  ? "border-tis-navy bg-tis-mist ring-2 ring-tis-navy/20"
                  : "border-black/[0.06] bg-white hover:bg-black/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-tis-navy">{UI_THEME_LABELS[id]}</p>
                {active ? (
                  <span className="rounded-full bg-tis-lime px-2 py-0.5 text-[10px] font-bold text-tis-on-lime">
                    Active
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-tis-muted">{UI_THEME_BLURBS[id]}</p>
              <ThemeSwatch theme={id} />
            </button>
          );
        })}
      </div>

      {message && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">{message}</p>
      )}
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>}
    </section>
  );
}

function ThemeSwatch({ theme }: { theme: UiTheme }) {
  if (theme === "lime_licorice") {
    return (
      <div className="mt-3 flex gap-1.5" aria-hidden>
        <span className="h-3 w-3 rounded-full bg-[#0b0d15]" />
        <span className="h-3 w-3 rounded-full bg-[#b6f34d]" />
        <span className="h-3 w-3 rounded-full bg-[#f4f5f9] ring-1 ring-black/10" />
        <span className="h-3 w-3 rounded-full bg-[#f3f4f8] ring-1 ring-black/10" />
      </div>
    );
  }
  return (
    <div className="mt-3 flex gap-1.5" aria-hidden>
      <span className="h-3 w-3 rounded-full bg-[#05513d]" />
      <span className="h-3 w-3 rounded-full bg-[#90ff09]" />
      <span className="h-3 w-3 rounded-full bg-[#f1f1ee] ring-1 ring-black/10" />
      <span className="h-3 w-3 rounded-full bg-[#9b7bff]" />
    </div>
  );
}
