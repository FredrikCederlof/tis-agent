"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_KEY, type ThemeMode } from "@/lib/theme";

export type { ThemeMode };
export { THEME_KEY, THEME_BOOT_SCRIPT } from "@/lib/theme";

export function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  window.localStorage.setItem(THEME_KEY, mode);
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    setMode(readStoredTheme());
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    applyTheme(next);
    setMode(next);
  }

  const label = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-transparent text-sm font-semibold text-white transition hover:bg-white/10 ${
        compact ? "h-10 w-10 !px-0" : "w-full px-4 py-2.5"
      }`}
      title={label}
      aria-label={label}
    >
      {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && (mode === "dark" ? "Light mode" : "Dark mode")}
    </button>
  );
}
