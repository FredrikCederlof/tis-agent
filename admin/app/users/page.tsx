import { AppShell, PageHeader } from "@/components/app-shell";
import { requireAdminPage } from "@/lib/authz";
import { createServiceClient } from "@/lib/supabase/service";
import type { AdminInvitationRow, AdminProfileManaged } from "@/lib/users";
import { UsersManagement } from "./users-management";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { user, profile, supabase } = await requireAdminPage();

  const [{ count }] = await Promise.all([
    supabase.from("unanswered_interactions").select("id", { count: "exact", head: true }),
  ]);

  let profiles: AdminProfileManaged[] = [];
  let invitations: AdminInvitationRow[] = [];

  try {
    const service = createServiceClient();
    const [profileResult, inviteResult] = await Promise.all([
      service
        .from("admin_profiles")
        .select(
          "user_id, email, first_name, last_name, role, status, deactivated_at, created_at",
        )
        .order("first_name", { ascending: true }),
      service
        .from("admin_invitations")
        .select(
          "id, email, first_name, last_name, role, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
    ]);
    profiles = (profileResult.data || []) as AdminProfileManaged[];
    invitations = (inviteResult.data || []) as AdminInvitationRow[];
  } catch {
    profiles = [
      {
        user_id: profile.user_id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
        status: profile.status,
        deactivated_at: null,
      },
    ];
  }

  return (
    <AppShell email={user.email || ""} unansweredCount={count ?? 0} profile={profile}>
      <PageHeader
        title="Users"
        subtitle="Invite people to Tina Admin and manage roles and access."
      />
      <UsersManagement
        initialProfiles={profiles}
        initialInvitations={invitations}
        currentUserId={user.id}
      />
    </AppShell>
  );
}
