import type { AdminRole } from "@/lib/account";

export type ProfileStatus = "active" | "deactivated";

export type InvitationStatus =
  | "pending"
  | "expired"
  | "revoked"
  | "accepted";

export type UserListStatus =
  | "active"
  | "deactivated"
  | "invitation_pending"
  | "invitation_expired";

export const INVITE_TTL_DAYS = 7;
export const INVITE_RATE_LIMIT_PER_HOUR = 20;

export type AdminInvitationRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: AdminRole;
  token_hash: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminProfileManaged = {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: AdminRole;
  status: ProfileStatus;
  deactivated_at: string | null;
  created_at?: string;
};

export type UserListItem = {
  kind: "profile" | "invitation";
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: AdminRole;
  status: UserListStatus;
  invited_at?: string | null;
  expires_at?: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const value = normalizeEmail(email);
  return Boolean(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function inviteExpiresAt(from: Date = new Date(), days = INVITE_TTL_DAYS): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function invitationStatus(
  row: Pick<AdminInvitationRow, "accepted_at" | "revoked_at" | "expires_at">,
  now: Date = new Date(),
): InvitationStatus {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "pending";
}

export function userListStatusLabel(status: UserListStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "deactivated":
      return "Deactivated";
    case "invitation_pending":
      return "Invitation pending";
    case "invitation_expired":
      return "Invitation expired";
    default:
      return status;
  }
}

export function roleDescription(role: AdminRole): string {
  if (role === "admin") {
    return "Full access including Users and Tina config.";
  }
  return "Can manage knowledge and use Tina Admin. Cannot manage users or Tina config.";
}

export function validateInviteFields(args: {
  firstName: string;
  lastName: string;
  email: string;
  role: unknown;
}): { ok: true; email: string; role: AdminRole } | { ok: false; error: string } {
  if (!args.firstName.trim()) {
    return { ok: false, error: "First name is required." };
  }
  if (!args.lastName.trim()) {
    return { ok: false, error: "Last name is required." };
  }
  if (!isValidEmail(args.email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (args.role !== "admin" && args.role !== "member") {
    return { ok: false, error: "Select a role." };
  }
  return {
    ok: true,
    email: normalizeEmail(args.email),
    role: args.role,
  };
}

/** Merge profiles + open invitations into one list for the Users page. */
export function buildUserList(args: {
  profiles: AdminProfileManaged[];
  invitations: AdminInvitationRow[];
  now?: Date;
}): UserListItem[] {
  const now = args.now || new Date();
  const activeEmails = new Set(
    args.profiles
      .filter((p) => p.status === "active")
      .map((p) => normalizeEmail(p.email)),
  );

  const profileItems: UserListItem[] = args.profiles.map((p) => ({
    kind: "profile",
    id: p.user_id,
    email: p.email,
    first_name: p.first_name,
    last_name: p.last_name,
    role: p.role,
    status: p.status === "deactivated" ? "deactivated" : "active",
  }));

  const inviteItems: UserListItem[] = [];
  for (const inv of args.invitations) {
    const status = invitationStatus(inv, now);
    if (status === "accepted" || status === "revoked") continue;
    if (activeEmails.has(normalizeEmail(inv.email))) continue;
    inviteItems.push({
      kind: "invitation",
      id: inv.id,
      email: inv.email,
      first_name: inv.first_name,
      last_name: inv.last_name,
      role: inv.role,
      status: status === "expired" ? "invitation_expired" : "invitation_pending",
      invited_at: inv.created_at,
      expires_at: inv.expires_at,
    });
  }

  return [...profileItems, ...inviteItems].sort((a, b) => {
    const an = `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase();
    const bn = `${b.first_name} ${b.last_name} ${b.email}`.toLowerCase();
    return an.localeCompare(bn);
  });
}

export function countActiveAdmins(
  profiles: Array<Pick<AdminProfileManaged, "role" | "status">>,
): number {
  return profiles.filter((p) => p.role === "admin" && p.status === "active").length;
}

export function wouldLeaveNoAdmin(args: {
  profiles: Array<Pick<AdminProfileManaged, "user_id" | "role" | "status">>;
  targetUserId: string;
  nextRole?: AdminRole;
  nextStatus?: ProfileStatus;
}): boolean {
  const simulated = args.profiles.map((p) => {
    if (p.user_id !== args.targetUserId) return p;
    return {
      ...p,
      role: args.nextRole ?? p.role,
      status: args.nextStatus ?? p.status,
    };
  });
  return countActiveAdmins(simulated) < 1;
}

export function adminSiteOrigin(fallbackOrigin?: string): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    process.env.ADMIN_SITE_URL ||
    process.env.VERCEL_URL;
  if (fromEnv) {
    if (fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) {
      return fromEnv.replace(/\/$/, "");
    }
    return `https://${fromEnv.replace(/\/$/, "")}`;
  }
  return (fallbackOrigin || "http://localhost:3000").replace(/\/$/, "");
}

export function onboardUrl(token: string, origin?: string): string {
  const base = adminSiteOrigin(origin);
  return `${base}/onboard?token=${encodeURIComponent(token)}`;
}
