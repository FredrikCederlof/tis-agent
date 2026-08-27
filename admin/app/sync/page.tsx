import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { SyncPanel } from "@/components/sync-panel";

export default async function SyncPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: documents } = await supabase
    .from("documents")
    .select("title, source_type, drive_modified_time, created_at")
    .order("title");

  const apiUrl = process.env.NEXT_PUBLIC_TINA_API_URL || "";
  const syncSecret = process.env.ADMIN_SYNC_SECRET || "";

  return (
    <div>
      <Nav email={user.email || ""} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-6 text-2xl font-semibold text-tis-navy">Knowledge sync</h2>
        <SyncPanel
          documents={documents || []}
          apiUrl={apiUrl}
          syncSecret={syncSecret}
        />
      </main>
    </div>
  );
}
