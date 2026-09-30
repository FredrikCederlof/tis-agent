import { AppShell, PageHeader } from "@/components/app-shell";
import { SandboxWorkspace } from "@/components/sandbox-workspace";
import {
  avatarInitial,
  avatarPublicUrl,
  displayFirstName,
} from "@/lib/account";
import { requireSignedIn } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function SandboxPage() {
  const { user, profile, supabase } = await requireSignedIn();
  const { count } = await supabase
    .from("unanswered_interactions")
    .select("id", { count: "exact", head: true });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

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
        <SandboxWorkspace
          user={{
            name: displayFirstName(profile),
            initial: avatarInitial(profile),
            avatarUrl: avatarPublicUrl(supabaseUrl, profile.avatar_path),
          }}
        />
      </div>
    </AppShell>
  );
}
