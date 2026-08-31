import Link from "next/link";
import { groupCategories } from "@/lib/knowledge-hub";
import type { KnowledgeEntry } from "@/lib/types";

export function KnowledgeCategories({ rows }: { rows: KnowledgeEntry[] }) {
  const categories = groupCategories(rows);

  if (categories.length === 0) {
    return (
      <div className="card text-sm text-tis-muted">
        No active Knowledge Hub entries yet.
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((item) => (
        <li key={item.slug}>
          <Link
            href={`/knowledge/category/${item.slug}`}
            className="card block transition hover:border-tis-sky/40 hover:shadow-md"
          >
            <p className="font-semibold text-tis-navy">{item.name}</p>
            <p className="mt-1 text-sm text-tis-muted">
              {item.count} {item.count === 1 ? "article" : "articles"}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
