import type { KnowledgeEntry } from "@/lib/types";

export const PAGE_SIZE = 20;
export const CATEGORY_THRESHOLD = 100;
export const UNCATEGORIZED = "Uncategorized";
export const UNCATEGORIZED_SLUG = "uncategorized";
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

export function showCategoryLanding(activeCount: number): boolean {
  return activeCount > CATEGORY_THRESHOLD;
}

export function categoryLabel(category: string | null | undefined): string {
  const text = (category || "").trim();
  return text || UNCATEGORIZED;
}

export function categorySlug(category: string | null | undefined): string {
  const label = categoryLabel(category);
  if (label === UNCATEGORIZED) return UNCATEGORIZED_SLUG;
  return encodeURIComponent(label);
}

export function categoryFromSlug(slug: string): string | null {
  const decoded = decodeURIComponent(slug || "");
  if (!decoded || decoded === UNCATEGORIZED_SLUG) return null;
  return decoded;
}

export function groupCategories(
  rows: KnowledgeEntry[],
): { name: string; slug: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if ((row.status || "active") !== "active") continue;
    const name = categoryLabel(row.category);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, slug: categorySlug(name), count }))
    .sort((a, b) => {
      if (a.name === UNCATEGORIZED) return 1;
      if (b.name === UNCATEGORIZED) return -1;
      return a.name.localeCompare(b.name);
    });
}

export function entriesInCategory(
  rows: KnowledgeEntry[],
  category: string | null,
): KnowledgeEntry[] {
  return rows.filter((row) => {
    const label = categoryLabel(row.category);
    if (category === null) return label === UNCATEGORIZED;
    return label === category;
  });
}
