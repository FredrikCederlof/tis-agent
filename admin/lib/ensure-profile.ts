import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminProfile, AdminRole } from "@/lib/account";

function inferredFirstName(user: User): string {
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const full = String(meta.full_name || meta.name || "").trim();
  if (full) return full.split(/\s+/)[0] || full;
  const email = user.email || "";
  return email.includes("@") ? email.split("@")[0] || "Admin" : email || "Admin";
}

function bootstrapRole(user: User): AdminRole {
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  if (meta.admin_role === "member" || meta.admin_role === "admin") {
    return meta.admin_role;
  }
  // Bootstrap allowlist users remain administrators when auto-provisioned.
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = (user.email || "").toLowerCase();
  if (allowed.length === 0 || allowed.includes(email)) {
    return "admin";
  }
  return "member";
}

export async function ensureAdminProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<AdminProfile> {
  const { data: existing } = await supabase
    .from("admin_profiles")
    .select("user_id, email, first_name, last_name, avatar_path, role, notify_message_previews")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return existing as AdminProfile;
  }

  const role = bootstrapRole(user);
  const row = {
    user_id: user.id,
    email: user.email || "",
    first_name: inferredFirstName(user),
<<<<<<< HEAD
    last_name: String(
      ((user.user_metadata || {}) as Record<string, unknown>).last_name || "",
    ),
    role,
    status: "active",
=======
    last_name: "",
    role: "admin" as AdminRole,
    notify_message_previews: false,
>>>>>>> c4a3e05 (Improve Needs attention push title, preview payload, and deep links.)
  };

  const { data: created, error } = await supabase
    .from("admin_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id, email, first_name, last_name, avatar_path, role, notify_message_previews")
    .single();

  if (error || !created) {
    return {
      user_id: user.id,
      email: user.email || "",
      first_name: inferredFirstName(user),
      last_name: "",
      avatar_path: null,
<<<<<<< HEAD
      role,
=======
      role: "admin",
      notify_message_previews: false,
>>>>>>> c4a3e05 (Improve Needs attention push title, preview payload, and deep links.)
    };
  }
  return created as AdminProfile;
}
