import { createClient } from "@/lib/supabase/server";
import { AppShell, PageHeader } from "@/components/app-shell";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { ensureAdminProfile } from "@/lib/ensure-profile";
import type { AdminProfile } from "@/lib/account";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ count }, profile] = await Promise.all([
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
    ensureAdminProfile(supabase, user),
  ]);

  const { data: teamRows } = await supabase
    .from("admin_profiles")
    .select("user_id, email, first_name, last_name, role")
    .order("first_name", { ascending: true });

  return (
    <AppShell
      email={user.email || ""}
      unansweredCount={count ?? 0}
      profile={profile}
    >
      <PageHeader
        title="Account settings"
        subtitle="Manage your profile, photo, and password."
      />
      <AccountSettingsForm
        profile={profile}
        teamMembers={(teamRows || []) as AdminProfile[]}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ""}
      />
    </AppShell>
  );
}
