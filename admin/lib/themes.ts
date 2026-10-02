/** Per-user Tina Admin UI themes. */

export const UI_THEMES = ["lime_licorice", "green_garden"] as const;
export type UiTheme = (typeof UI_THEMES)[number];

export const DEFAULT_UI_THEME: UiTheme = "lime_licorice";

export const UI_THEME_LABELS: Record<UiTheme, string> = {
  lime_licorice: "Lime Licorice",
  green_garden: "Green Garden",
};

export const UI_THEME_BLURBS: Record<UiTheme, string> = {
  lime_licorice:
    "Bright lime accents on a pale cool-gray workspace. Default for new accounts.",
  green_garden: "Classic deep TIS green sidebar and acid lime accents.",
};

export function parseUiTheme(value: unknown): UiTheme | null {
  if (value === "lime_licorice" || value === "green_garden") return value;
  return null;
}

export function normalizeUiTheme(value: unknown): UiTheme {
  return parseUiTheme(value) ?? DEFAULT_UI_THEME;
}

export function isLimeLicorice(theme: UiTheme | null | undefined): boolean {
  return normalizeUiTheme(theme) === "lime_licorice";
}
