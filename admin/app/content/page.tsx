import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { NewContentPage } from "@/components/new-content-page";
import { requireAdminPage } from "@/lib/authz";
import { publicPageHref, type ContentPage } from "@/lib/content-pages";

export default async function ContentPagesPage() {
  const { supabase, user, profile } = await requireAdminPage();
  const [{ data, error }, { count }] = await Promise.all([
    supabase.from("content_pages").select("*").order("sort_order").order("title"),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
  ]);
  const pages = (data || []) as ContentPage[];

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0} profile={profile}>
      <PageHeader
        title="Pages"
        subtitle="Edit the public privacy notice and add other public pages."
      />
      {error && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">{error.message}</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ul className="card divide-y divide-slate-100">
          {pages.length === 0 && (
            <li className="py-2 text-sm text-tis-muted">No pages yet.</li>
          )}
          {pages.map((page) => (
            <li key={page.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <Link href={`/content/${page.id}`} className="font-semibold text-tis-navy underline">
                  {page.title}
                </Link>
                <p className="text-xs text-tis-muted">
                  {publicPageHref(page.slug)} · {page.published ? "Published" : "Draft"}
                </p>
              </div>
              <Link href={`/content/${page.id}`} className="secondary">
                Edit
              </Link>
            </li>
          ))}
        </ul>
        <NewContentPage actorEmail={user.email || "admin"} />
      </div>
    </AppShell>
  );
}
