import type { KnowledgeEntry } from "@/lib/types";

export const PAGE_SIZE = 20;
/** Sparse named topics with this many or fewer articles roll into Other. */
export const SPARSE_CATEGORY_MAX = 3;
export const OTHER = "Other";
export const OTHER_SLUG = "other";
/** @deprecated use OTHER — kept for older links */
export const UNCATEGORIZED = OTHER;
export const UNCATEGORIZED_SLUG = OTHER_SLUG;
export const CREATE_SUCCESS_PATH = "/knowledge?added=1";

export function createSuccessPath(isNew: boolean): string {
  return isNew ? CREATE_SUCCESS_PATH : "";
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
    if ((row.status || "active") !== "active") continue;
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
    if ((row.status || "active") !== "active") return false;
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
