import type { KnowledgeEntry, KnowledgeStatus } from "@/lib/types";

export const PAGE_SIZE = 20;
/** Sparse named topics with this many or fewer articles roll into Other. */
export const SPARSE_CATEGORY_MAX = 3;
export const OTHER = "Other";
export const OTHER_SLUG = "other";
/** @deprecated use OTHER — kept for older links */
export const UNCATEGORIZED = OTHER;
export const UNCATEGORIZED_SLUG = OTHER_SLUG;
export const CREATE_SUCCESS_PATH = "/knowledge?added=1";

export const CONTENT_OWNERS = [
  "TIS Office",
  "Admissions",
  "IT",
  "PYP",
  "MYP",
  "DP",
  "Other",
] as const;

export const AUDIENCE_OPTIONS = [
  "All",
  "Parents",
  "Students",
  "Teachers",
  "PYP",
  "MYP",
  "DP",
  "Kindergarten",
  ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`),
] as const;

export function createSuccessPath(isNew: boolean): string {
  return isNew ? CREATE_SUCCESS_PATH : "";
}

function tokyoTodayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/** Resolve Draft / Active / Expired / Archived including auto-expiry. */
export function effectiveKnowledgeStatus(
  row: Pick<KnowledgeEntry, "status" | "valid_until">,
  todayIso = tokyoTodayIso(),
): KnowledgeStatus {
  const status = (row.status || "active") as KnowledgeStatus;
  if (status === "archived" || status === "draft") return status;
  const validUntil = dateOnly(row.valid_until);
  if (validUntil && validUntil < todayIso) return "expired";
  if (status === "expired") return "expired";
  return "active";
}

export function isReviewOverdue(
  row: Pick<KnowledgeEntry, "review_due_date" | "status" | "valid_until">,
  todayIso = tokyoTodayIso(),
): boolean {
  const due = dateOnly(row.review_due_date);
  if (!due) return false;
  if (effectiveKnowledgeStatus(row, todayIso) === "archived") return false;
  return due < todayIso;
}

export function formatIngestedAt(value: string | null | undefined): string {
  if (!value) return "Not yet ingested";
  return new Date(value).toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function paginate<T>(rows: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const safePage = page < 1 ? 1 : page;
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function pageCount(total: number, pageSize = PAGE_SIZE): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Always show category widgets (INS-21). */
export const CATEGORY_THRESHOLD = 0;

export function showCategoryLanding(_activeCount: number): boolean {
  return true;
}

export function normalizeCategoryName(category: string | null | undefined): string {
  const text = (category || "").trim().replace(/\s+/g, " ");
  if (!text) return OTHER;
  const lower = text.toLowerCase();
  if (lower === "uncategorized" || lower === "other") return OTHER;
  return text;
}

export function categoryLabel(category: string | null | undefined): string {
  return normalizeCategoryName(category);
}

export function categorySlug(category: string | null | undefined): string {
  const label = categoryLabel(category);
  if (label === OTHER) return OTHER_SLUG;
  return encodeURIComponent(label);
}

export function categoryFromSlug(slug: string): string | null {
  const decoded = decodeURIComponent(slug || "");
  if (!decoded || decoded === OTHER_SLUG || decoded === "uncategorized") return null;
  return decoded;
}

function activeCounts(rows: KnowledgeEntry[]): Map<string, { count: number; display: string }> {
  const raw = new Map<string, { count: number; display: string }>();
  for (const row of rows) {
    if (effectiveKnowledgeStatus(row) !== "active") continue;
    const display = categoryLabel(row.category);
    const key = display.toLowerCase();
    const existing = raw.get(key);
    if (existing) existing.count += 1;
    else raw.set(key, { count: 1, display });
  }
  return raw;
}

export type CategoryWidget = {
  name: string;
  slug: string;
  count: number;
  sourceNames: string[];
};

export function groupCategories(rows: KnowledgeEntry[]): CategoryWidget[] {
  const raw = activeCounts(rows);
  let otherCount = 0;
  const otherSources = new Set<string>();
  const dedicated: CategoryWidget[] = [];

  for (const { count, display } of raw.values()) {
    if (display === OTHER || count <= SPARSE_CATEGORY_MAX) {
      otherCount += count;
      otherSources.add(display);
      continue;
    }
    dedicated.push({
      name: display,
      slug: categorySlug(display),
      count,
      sourceNames: [display],
    });
  }

  dedicated.sort((a, b) => a.name.localeCompare(b.name));
  if (otherCount > 0) {
    dedicated.push({
      name: OTHER,
      slug: OTHER_SLUG,
      count: otherCount,
      sourceNames: [...otherSources].sort((a, b) => a.localeCompare(b)),
    });
  }
  return dedicated;
}

export function entriesInCategory(
  rows: KnowledgeEntry[],
  category: string | null,
): KnowledgeEntry[] {
  const counts = activeCounts(rows);
  return rows.filter((row) => {
    if (effectiveKnowledgeStatus(row) !== "active") return false;
    const label = categoryLabel(row.category);
    const key = label.toLowerCase();
    const count = counts.get(key)?.count || 0;
    if (category === null) {
      return label === OTHER || count <= SPARSE_CATEGORY_MAX;
    }
    if (count <= SPARSE_CATEGORY_MAX) return false;
    return key === category.toLowerCase();
  });
}
