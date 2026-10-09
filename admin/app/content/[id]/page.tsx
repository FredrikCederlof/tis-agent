import { notFound } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ContentPageEditor } from "@/components/content-page-editor";
import { requireAdminPage } from "@/lib/authz";
import type { ContentPage } from "@/lib/content-pages";

export default async function EditContentPage({ params }: { params: { id: string } }) {
  const { supabase, user, profile } = await requireAdminPage();
  const [{ data, error }, { count }] = await Promise.all([
    supabase.from("content_pages").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
  ]);
  if (error || !data) notFound();

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0} profile={profile}>
      <PageHeader title="Edit page" subtitle="What you save here is what parents see." />
      <ContentPageEditor page={data as ContentPage} actorEmail={user.email || "admin"} />
    </AppShell>
  );
}
