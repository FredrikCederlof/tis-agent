import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { requireSignedIn } from "@/lib/authz";

export default async function AccountPage() {
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
        title="Account settings"
        subtitle="Manage your profile, password, and Needs attention alerts."
      />
      <AccountSettingsForm
        profile={profile}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ""}
      />
    </AppShell>
  );
}
