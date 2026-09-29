"use client";

import { useEffect, useState } from "react";
import { WaMessage } from "@/components/wa-message";
import {
  shouldTranslateForAdmin,
  translationCacheKey,
} from "@/lib/admin-translate";

type CacheMap = Record<string, string>;

function readCache(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCache(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore quota / private mode.
  }
}

/** Show English for admins; keep original available when translated. */
export function AdminEnglishText({
  text,
  language,
  className = "",
  plain = false,
}: {
  text: string;
  language?: string | null;
  className?: string;
  /** Inline preview without WhatsApp markup / show-original toggle. */
  plain?: boolean;
}) {
  const needs = shouldTranslateForAdmin(text, language);
  const [english, setEnglish] = useState<string | null>(() => {
    if (!needs) return text;
    return readCache(translationCacheKey(text));
  });
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    if (!needs) {
      setEnglish(text);
      setError(null);
      return;
    }
    const key = translationCacheKey(text);
    const cached = readCache(key);
    if (cached) {
      setEnglish(cached);
      return;
    }
    let cancelled = false;
    setEnglish(null);
    setError(null);
    void (async () => {
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: [text] }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.detail || `Translation failed (${response.status})`);
        }
        const translated = String(result.translations?.[0] || "").trim();
        if (!translated) throw new Error("Empty translation");
        writeCache(key, translated);
        if (!cancelled) setEnglish(translated);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Translation failed");
          setEnglish(text);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [text, needs]);

  const display = english ?? text;
  const translating = needs && english == null && !error;

  if (plain) {
    return (
      <span className={className}>
        {translating ? "Translating…" : display}
      </span>
    );
  }

  return (
    <div className={className}>
      {translating ? (
        <p className="text-sm italic opacity-70">Translating to English…</p>
      ) : (
        <WaMessage text={display} />
      )}
      {needs && english && english !== text ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-[11px] font-semibold underline-offset-2 hover:underline opacity-80"
            onClick={() => setShowOriginal((v) => !v)}
          >
            {showOriginal ? "Hide original" : "Show original"}
          </button>
          {showOriginal ? (
            <div className="mt-1 rounded-lg bg-black/10 px-2.5 py-1.5 text-[12px] opacity-90">
              <WaMessage text={text} />
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="mt-1 text-[11px] opacity-70">Showing original — {error}</p>
      ) : null}
    </div>
  );
}

/** Batch-translate list preview strings; returns a map of original → English. */
export function useAdminEnglishMap(
  texts: string[],
  languageByText: Record<string, string | null | undefined>,
): CacheMap {
  const [map, setMap] = useState<CacheMap>({});

  useEffect(() => {
    const pending = texts.filter((text) => {
      if (!text.trim()) return false;
      if (!shouldTranslateForAdmin(text, languageByText[text])) return false;
      if (readCache(translationCacheKey(text))) return false;
      return map[text] == null;
    });
    if (!pending.length) {
      // Hydrate from cache for visible rows.
      const next: CacheMap = { ...map };
      let changed = false;
      for (const text of texts) {
        if (!shouldTranslateForAdmin(text, languageByText[text])) {
          if (next[text] !== text) {
            next[text] = text;
            changed = true;
          }
          continue;
        }
        const cached = readCache(translationCacheKey(text));
        if (cached && next[text] !== cached) {
          next[text] = cached;
          changed = true;
        }
      }
      if (changed) setMap(next);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: pending.slice(0, 40) }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(result.translations)) return;
        if (cancelled) return;
        setMap((current) => {
          const next = { ...current };
          pending.slice(0, 40).forEach((text, index) => {
            const translated = String(result.translations[index] || "").trim();
            if (!translated) return;
            writeCache(translationCacheKey(text), translated);
            next[text] = translated;
          });
          return next;
        });
      } catch {
        // Leave originals visible.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally depend on joined texts; language map is stable enough per list page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texts.join("\u0001")]);

  return map;
}
