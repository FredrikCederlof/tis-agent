/** Account profile helpers (INS-15). */

export const AVATAR_BUCKET = "admin-avatars";
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AdminRole = "admin" | "member";

export type AdminProfile = {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_path: string | null;
  role: AdminRole;
  /** When true, Needs attention push notifications include a short question preview. Default false. */
  notify_message_previews?: boolean;
};

export function roleLabel(role: AdminRole | string | null | undefined): string {
  if (role === "member") return "Member";
  return "Admin";
}

export function displayFirstName(profile: Pick<AdminProfile, "first_name" | "email"> | null | undefined): string {
  const first = (profile?.first_name || "").trim();
  if (first) return first;
  const email = (profile?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0] || "Admin";
  return email || "Admin";
}

export function avatarInitial(profile: Pick<AdminProfile, "first_name" | "email"> | null | undefined): string {
  return displayFirstName(profile).slice(0, 1).toUpperCase() || "?";
}

export function avatarPublicUrl(
  supabaseUrl: string,
  avatarPath: string | null | undefined,
): string | null {
  if (!avatarPath) return null;
  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${avatarPath}`;
}

export function validateAvatarFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
    return {
      ok: false,
      error: "Use a JPEG, PNG, WebP, or GIF image.",
    };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      error: "Profile images must be 10 MB or smaller.",
    };
  }
  return { ok: true };
}

/** Tina password rules (no prior policy in repo — keep practical and clear). */
export function validatePassword(password: string): { ok: true } | { ok: false; error: string } {
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      ok: false,
      error: "Password must include at least one letter and one number.",
    };
  }
  return { ok: true };
}

export function validatePasswordChange(args: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  requireCurrent: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (args.requireCurrent && !args.currentPassword) {
    return { ok: false, error: "Enter your current password." };
  }
  if (args.newPassword !== args.confirmPassword) {
    return { ok: false, error: "New password and confirmation do not match." };
  }
  if (args.currentPassword && args.currentPassword === args.newPassword) {
    return { ok: false, error: "New password must be different from the current password." };
  }
  return validatePassword(args.newPassword);
}

export function validateProfileFields(args: {
  firstName: string;
  lastName: string;
  email: string;
}): { ok: true } | { ok: false; error: string } {
  if (!args.firstName.trim()) {
    return { ok: false, error: "First name is required." };
  }
  if (!args.email.trim() || !args.email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true };
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

export function parseAdminRole(value: unknown): AdminRole | null {
  if (value === "admin" || value === "member") return value;
  return null;
}
