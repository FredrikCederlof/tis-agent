/** Admin-only English display helpers for parent / Tina chat text. */

export function isEnglishLanguage(language: string | null | undefined): boolean {
  const code = (language || "en").trim().toLowerCase().split(/[-_]/)[0];
  return code === "en" || code === "";
}

/** Heuristic: skip translation when the text is already mostly English ASCII. */
export function looksLikeEnglish(text: string): boolean {
  const sample = (text || "").trim();
  if (!sample) return true;
  const letters = sample.replace(/[^A-Za-zÀ-öø-ÿ]/g, "");
  if (!letters) return true;
  const ascii = letters.replace(/[^A-Za-z]/g, "");
  return ascii.length / letters.length >= 0.92;
}

export function shouldTranslateForAdmin(
  text: string,
  language: string | null | undefined,
): boolean {
  if (!text.trim()) return false;
  if (isEnglishLanguage(language)) return false;
  if (looksLikeEnglish(text)) return false;
  return true;
}

export function translationCacheKey(text: string): string {
  // Simple stable key for sessionStorage (not cryptographic).
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `tis-admin-en:${(hash >>> 0).toString(16)}:${text.length}`;
}
