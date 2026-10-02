import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminProfile, AdminRole } from "@/lib/account";
import { DEFAULT_UI_THEME, normalizeUiTheme } from "@/lib/themes";

const PROFILE_COLUMNS =
  "user_id, email, first_name, last_name, avatar_path, role, notify_message_previews, ui_theme";

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
    .select(PROFILE_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return {
      ...(existing as AdminProfile),
      ui_theme: normalizeUiTheme((existing as AdminProfile).ui_theme),
    };
  }

  const role = bootstrapRole(user);
  const row = {
    user_id: user.id,
    email: user.email || "",
    first_name: inferredFirstName(user),
    last_name: String(
      ((user.user_metadata || {}) as Record<string, unknown>).last_name || "",
    ),
    role,
    status: "active",
    notify_message_previews: true,
    ui_theme: DEFAULT_UI_THEME,
  };

  const { data: created, error } = await supabase
    .from("admin_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select(PROFILE_COLUMNS)
    .single();

  if (error || !created) {
    return {
      user_id: user.id,
      email: user.email || "",
      first_name: inferredFirstName(user),
      last_name: "",
      avatar_path: null,
      role,
      notify_message_previews: true,
      ui_theme: DEFAULT_UI_THEME,
    };
  }
  return {
    ...(created as AdminProfile),
    ui_theme: normalizeUiTheme((created as AdminProfile).ui_theme),
  };
}
