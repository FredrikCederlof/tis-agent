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

export async function ensureAdminProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<AdminProfile> {
  const { data: existing } = await supabase
    .from("admin_profiles")
    .select("user_id, email, first_name, last_name, avatar_path, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return existing as AdminProfile;
  }

  const row = {
    user_id: user.id,
    email: user.email || "",
    first_name: inferredFirstName(user),
    last_name: "",
    role: "admin" as AdminRole,
  };

  const { data: created, error } = await supabase
    .from("admin_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id, email, first_name, last_name, avatar_path, role")
    .single();

  if (error || !created) {
    return {
      user_id: user.id,
      email: user.email || "",
      first_name: inferredFirstName(user),
      last_name: "",
      avatar_path: null,
      role: "admin",
    };
  }
  return created as AdminProfile;
}
