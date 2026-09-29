/** Language codes → English name + optional flag (recognition aid only). */

export type LanguageInfo = {
  code: string;
  name: string;
  /** Flag emoji when a common country mapping exists; omit for globe fallback. */
  flag?: string;
};

const LANGUAGES: Record<string, LanguageInfo> = {
  en: { code: "EN", name: "English", flag: "🇬🇧" },
  ja: { code: "JA", name: "Japanese", flag: "🇯🇵" },
  sv: { code: "SV", name: "Swedish", flag: "🇸🇪" },
  zh: { code: "ZH", name: "Chinese", flag: "🇨🇳" },
  ko: { code: "KO", name: "Korean", flag: "🇰🇷" },
  es: { code: "ES", name: "Spanish", flag: "🇪🇸" },
  fr: { code: "FR", name: "French", flag: "🇫🇷" },
  de: { code: "DE", name: "German", flag: "🇩🇪" },
  pt: { code: "PT", name: "Portuguese", flag: "🇵🇹" },
  it: { code: "IT", name: "Italian", flag: "🇮🇹" },
  nl: { code: "NL", name: "Dutch", flag: "🇳🇱" },
  fi: { code: "FI", name: "Finnish", flag: "🇫🇮" },
  no: { code: "NO", name: "Norwegian", flag: "🇳🇴" },
  da: { code: "DA", name: "Danish", flag: "🇩🇰" },
  ar: { code: "AR", name: "Arabic" },
  hi: { code: "HI", name: "Hindi", flag: "🇮🇳" },
  th: { code: "TH", name: "Thai", flag: "🇹🇭" },
  vi: { code: "VI", name: "Vietnamese", flag: "🇻🇳" },
  id: { code: "ID", name: "Indonesian", flag: "🇮🇩" },
  ms: { code: "MS", name: "Malay", flag: "🇲🇾" },
  ru: { code: "RU", name: "Russian", flag: "🇷🇺" },
  pl: { code: "PL", name: "Polish", flag: "🇵🇱" },
  tr: { code: "TR", name: "Turkish", flag: "🇹🇷" },
};

export function languageInfo(raw: string | null | undefined): LanguageInfo {
  const normalized = (raw || "en").trim().toLowerCase().split(/[-_]/)[0] || "en";
  const known = LANGUAGES[normalized];
  if (known) return known;
  const code = normalized.slice(0, 8).toUpperCase() || "EN";
  return { code, name: `Language ${code}` };
}
