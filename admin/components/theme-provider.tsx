"use client";

import { createContext, useContext, useEffect } from "react";
import {
  DEFAULT_UI_THEME,
  normalizeUiTheme,
  type UiTheme,
} from "@/lib/themes";

const ThemeContext = createContext<UiTheme>(DEFAULT_UI_THEME);

export function useUiTheme(): UiTheme {
  return useContext(ThemeContext);
}

/** Syncs the signed-in user's theme onto <html data-theme> and provides context. */
export function ThemeProvider({
  theme,
  children,
}: {
  theme?: UiTheme | null;
  children: React.ReactNode;
}) {
  const resolved = normalizeUiTheme(theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.classList.toggle("theme-lime", resolved === "lime_licorice");
    document.documentElement.classList.toggle("theme-garden", resolved === "green_garden");
  }, [resolved]);

  return <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>;
}
