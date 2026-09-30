import Link from "next/link";
import {
  BookOpen,
  Calendar,
  Folder,
  GraduationCap,
  HeartPulse,
  Shirt,
  Users,
} from "lucide-react";
import { OTHER, groupCategories } from "@/lib/knowledge-hub";
import type { KnowledgeEntry } from "@/lib/types";

function categoryIcon(name: string) {
  const key = name.toLowerCase();
  if (key.includes("uniform") || key.includes("dress")) return Shirt;
  if (key.includes("health") || key.includes("medical") || key.includes("absence")) {
    return HeartPulse;
  }
  if (key.includes("calendar") || key.includes("event") || key.includes("holiday")) {
    return Calendar;
  }
  if (key.includes("curriculum") || key.includes("academic") || key.includes("ib")) {
    return GraduationCap;
  }
  if (key.includes("parent") || key.includes("pta") || key.includes("community")) {
    return Users;
  }
  if (name === OTHER) return Folder;
  return BookOpen;
}

export function KnowledgeCategories({ rows }: { rows: KnowledgeEntry[] }) {
  const categories = groupCategories(rows);
  const maxCount = Math.max(1, ...categories.map((c) => c.count));

  if (rows.filter((r) => (r.status || "active") === "active").length === 0) {
    return (
      <div className="card text-sm text-tis-muted">
        No knowledge articles yet. Use <span className="font-semibold">Add knowledge</span> to
        create the first entry.
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="card text-sm text-tis-muted">No active Knowledge Hub entries yet.</div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((item) => {
        const Icon = categoryIcon(item.name);
        const widthPct = Math.max(8, Math.round((item.count / maxCount) * 100));
        return (
          <li key={item.slug}>
            <Link
              href={`/knowledge/category/${item.slug}`}
              className="card block transition hover:border-tis-sky/40 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tis-mist text-tis-navy">
                  <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-tis-navy">{item.name}</p>
                  <p className="mt-0.5 text-sm text-tis-muted">
                    {item.count} {item.count === 1 ? "article" : "articles"}
                  </p>
                  <div
                    className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-tis-navy/70"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
