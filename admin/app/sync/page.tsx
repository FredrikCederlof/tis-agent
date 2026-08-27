import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { SyncPanel } from "@/components/sync-panel";

export default async function SyncPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: documents }, { count }] = await Promise.all([
    supabase
      .from("documents")
      .select("title, source_type, drive_modified_time, created_at")
      .order("title"),
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
  ]);

  const apiUrl = process.env.NEXT_PUBLIC_TINA_API_URL || "";
  const syncSecret = process.env.ADMIN_SYNC_SECRET || "";

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0}>
      <PageHeader
        title="Knowledge sync"
        subtitle="Re-fetch public web and calendar sources into Supabase when the school updates them."
      />
      <SyncPanel
        documents={documents || []}
        apiUrl={apiUrl}
        syncSecret={syncSecret}
      />
    </AppShell>
  );
}
