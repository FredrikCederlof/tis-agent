import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import {
  isAdminRole,
  type AdminProfile,
  type AdminRole,
} from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAdminProfile } from "@/lib/ensure-profile";
import type { ProfileStatus } from "@/lib/users";

export type AuthzProfile = AdminProfile & {
  status: ProfileStatus;
};

const PROFILE_SELECT =
  "user_id, email, first_name, last_name, avatar_path, role, status";

export async function loadAuthzProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<AuthzProfile> {
  const base = await ensureAdminProfile(supabase, user);
  const { data } = await supabase
    .from("admin_profiles")
    .select(PROFILE_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  if (data) {
    return {
      ...(data as AdminProfile),
      status: ((data as { status?: string }).status as ProfileStatus) || "active",
    };
  }

  return { ...base, status: "active" };
}

export function isActiveAdmin(profile: Pick<AuthzProfile, "role" | "status">): boolean {
  return isAdminRole(profile.role) && profile.status === "active";
}

export function canAccessTinaAdmin(
  profile: Pick<AuthzProfile, "status"> | null,
): boolean {
  return Boolean(profile && profile.status === "active");
}

/** Server Component / page guard. */
export async function requireSignedIn(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  profile: AuthzProfile;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = await loadAuthzProfile(supabase, user);
  if (profile.status === "deactivated") {
    await supabase.auth.signOut();
    redirect("/login?error=deactivated");
  }
  return { supabase, user, profile };
}

export async function requireAdminPage(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  profile: AuthzProfile;
}> {
  const ctx = await requireSignedIn();
  if (!isActiveAdmin(ctx.profile)) {
    redirect("/?error=forbidden");
  }
  return ctx;
}

/** API route helpers. */
export async function requireApiUser(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: User; profile: AuthzProfile }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ detail: "Not signed in" }, { status: 401 }) };
  }
  const profile = await loadAuthzProfile(supabase, user);
  if (profile.status === "deactivated") {
    return {
      ok: false,
      response: NextResponse.json({ detail: "Account deactivated." }, { status: 403 }),
    };
  }
  return { ok: true, supabase, user, profile };
}

export async function requireApiAdmin(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: User; profile: AuthzProfile }
  | { ok: false; response: NextResponse }
> {
  const result = await requireApiUser();
  if (!result.ok) return result;
  if (!isActiveAdmin(result.profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        { detail: "Only administrators can perform this action." },
        { status: 403 },
      ),
    };
  }
  return result;
}

export async function writeAuditEvent(args: {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const service = createServiceClient();
    await service.from("admin_audit_events").insert({
      action: args.action,
      actor_user_id: args.actorUserId || null,
      target_user_id: args.targetUserId || null,
      target_email: args.targetEmail || null,
      metadata: args.metadata || {},
    });
  } catch {
    // Audit must not break the primary action if misconfigured.
  }
}

export function parseRoleOrNull(value: unknown): AdminRole | null {
  if (value === "admin" || value === "member") return value;
  return null;
}
