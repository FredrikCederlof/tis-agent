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
    const label = categoryLabel(row.category);
    const key = label.toLowerCase();
    const activeCount = counts.get(key)?.count || 0;
    // Sparse folding uses active counts; drafts/expired/archived still list in
    // the same category bucket as their topic (or Other when sparse).
    if (category === null) {
      return label === OTHER || activeCount <= SPARSE_CATEGORY_MAX;
    }
    if (activeCount <= SPARSE_CATEGORY_MAX) return false;
    return key === category.toLowerCase();
  });
}

export type KnowledgeListSortKey =
  | "question"
  | "tags"
  | "status"
  | "review"
  | "ingested";

export type KnowledgeListStatusTab =
  | "all"
  | "active"
  | "needs_review"
  | "draft"
  | "expired";

export type KnowledgeListSortDir = "asc" | "desc";

/** Display label for the Status column (Review due overrides Active). */
export function knowledgeListStatusLabel(
  row: Pick<KnowledgeEntry, "status" | "valid_until" | "review_due_date">,
  todayIso = tokyoTodayIso(),
): string {
  const resolved = effectiveKnowledgeStatus(row, todayIso);
  if (resolved === "active" && isReviewOverdue(row, todayIso)) return "Review due";
  if (resolved === "draft") return "Draft";
  if (resolved === "expired") return "Expired";
  if (resolved === "archived") return "Archived";
  return "Active";
}

export function formatKnowledgeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatIngestedParts(value: string | null | undefined): {
  date: string;
  time: string;
} | null {
  if (!value) return null;
  const d = new Date(value);
  return {
    date: d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

function reviewSortValue(
  row: Pick<KnowledgeEntry, "status" | "valid_until" | "review_due_date">,
  todayIso = tokyoTodayIso(),
): string {
  const resolved = effectiveKnowledgeStatus(row, todayIso);
  if (resolved === "expired") return dateOnly(row.valid_until) || "9999-12-31";
  return dateOnly(row.review_due_date) || "9999-12-31";
}

function statusSortRank(
  row: Pick<KnowledgeEntry, "status" | "valid_until" | "review_due_date">,
  todayIso = tokyoTodayIso(),
): number {
  const label = knowledgeListStatusLabel(row, todayIso);
  switch (label) {
    case "Review due":
      return 0;
    case "Expired":
      return 1;
    case "Draft":
      return 2;
    case "Archived":
      return 3;
    default:
      return 4;
  }
}

export function filterKnowledgeList(
  rows: KnowledgeEntry[],
  opts: {
    query?: string;
    statusTab?: KnowledgeListStatusTab;
    status?: "" | KnowledgeEntry["status"];
    origin?: "" | KnowledgeEntry["origin"];
    audience?: string;
    owner?: string;
    tag?: string;
    todayIso?: string;
  },
): KnowledgeEntry[] {
  const todayIso = opts.todayIso || tokyoTodayIso();
  const needle = (opts.query || "").trim().toLowerCase();
  const statusTab = opts.statusTab || "all";

  return rows.filter((row) => {
    const resolved = effectiveKnowledgeStatus(row, todayIso);
    if (statusTab === "active" && resolved !== "active") return false;
    if (statusTab === "draft" && resolved !== "draft") return false;
    if (statusTab === "expired" && resolved !== "expired") return false;
    if (statusTab === "needs_review" && !isReviewOverdue(row, todayIso)) return false;
    if (opts.status && resolved !== opts.status) return false;
    if (opts.origin && row.origin !== opts.origin) return false;
    if (opts.audience && !(row.audience || []).includes(opts.audience)) return false;
    if (opts.owner) {
      const owner = (row.content_owner || "").trim();
      if (owner.toLowerCase() !== opts.owner.toLowerCase()) return false;
    }
    if (opts.tag && !(row.tags || []).includes(opts.tag)) return false;
    if (!needle) return true;
    const haystack = [
      row.primary_question,
      row.answer,
      row.category || "",
      ...(row.similar_questions || []),
      ...(row.tags || []),
      row.source_note || "",
      row.content_owner || "",
      ...(row.audience || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function sortKnowledgeList(
  rows: KnowledgeEntry[],
  key: KnowledgeListSortKey,
  dir: KnowledgeListSortDir,
  todayIso = tokyoTodayIso(),
): KnowledgeEntry[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "question":
        cmp = a.primary_question.localeCompare(b.primary_question);
        break;
      case "tags":
        cmp = (a.tags || []).join(",").localeCompare((b.tags || []).join(","));
        break;
      case "status":
        cmp = statusSortRank(a, todayIso) - statusSortRank(b, todayIso);
        if (cmp === 0) {
          cmp = knowledgeListStatusLabel(a, todayIso).localeCompare(
            knowledgeListStatusLabel(b, todayIso),
          );
        }
        break;
      case "review":
        cmp = reviewSortValue(a, todayIso).localeCompare(reviewSortValue(b, todayIso));
        break;
      case "ingested": {
        const ai = a.last_ingested_at || "";
        const bi = b.last_ingested_at || "";
        cmp = ai.localeCompare(bi);
        break;
      }
      default:
        cmp = 0;
    }
    if (cmp === 0) cmp = a.primary_question.localeCompare(b.primary_question);
    return cmp * factor;
  });
}

export function knowledgeListTabCounts(
  rows: KnowledgeEntry[],
  todayIso = tokyoTodayIso(),
): Record<KnowledgeListStatusTab, number> {
  const counts: Record<KnowledgeListStatusTab, number> = {
    all: rows.length,
    active: 0,
    needs_review: 0,
    draft: 0,
    expired: 0,
  };
  for (const row of rows) {
    const resolved = effectiveKnowledgeStatus(row, todayIso);
    if (resolved === "active") counts.active += 1;
    if (resolved === "draft") counts.draft += 1;
    if (resolved === "expired") counts.expired += 1;
    if (isReviewOverdue(row, todayIso)) counts.needs_review += 1;
  }
  return counts;
}

export function categoryPageSubtitle(categoryName: string): string {
  if (categoryName === OTHER) {
    return "Knowledge used by Tina that doesn't belong to another category.";
  }
  return `Knowledge Hub articles filed under ${categoryName}.`;
}
