import { AppShell, PageHeader } from "@/components/app-shell";
import { SandboxWorkspace } from "@/components/sandbox-workspace";
import { requireSignedIn } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function SandboxPage() {
  const { user, profile, supabase } = await requireSignedIn();
  const { count } = await supabase
    .from("unanswered_interactions")
    .select("id", { count: "exact", head: true });

  return (
    <AppShell
      email={user.email || ""}
      unansweredCount={count ?? 0}
      profile={profile}
    >
      <PageHeader
        title="Sandbox"
        subtitle="Try Tina without WhatsApp. Chats are private to your account and grouped by month."
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <SandboxWorkspace />
      </div>
    </AppShell>
  );
}
