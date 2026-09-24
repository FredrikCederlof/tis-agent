import { NextResponse } from "next/server";
import { validatePassword, validatePasswordChange } from "@/lib/account";
import { writeAuditEvent } from "@/lib/authz";
import { createServiceClient } from "@/lib/supabase/service";
import {
  invitationStatus,
  normalizeEmail,
  type AdminInvitationRow,
} from "@/lib/users";
import { hashInviteToken } from "@/lib/invite-tokens";

/** Public: inspect invitation without consuming it. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ detail: "Missing invitation token." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ detail: "Onboarding is not configured." }, { status: 503 });
  }

  const tokenHash = hashInviteToken(token);
  const { data: invitation, error } = await service
    .from("admin_invitations")
    .select(
      "id, email, first_name, last_name, role, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at, updated_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !invitation) {
    return NextResponse.json({ status: "invalid", detail: "This invitation link is not valid." });
  }

  const status = invitationStatus(invitation as AdminInvitationRow);
  if (status !== "pending") {
    return NextResponse.json({
      status,
      detail:
        status === "expired"
          ? "This invitation has expired. Ask an administrator to resend it."
          : status === "revoked"
            ? "This invitation was revoked. Ask an administrator for a new invite."
            : "This invitation was already used.",
      email: invitation.email,
      first_name: invitation.first_name,
      last_name: invitation.last_name,
    });
  }

  return NextResponse.json({
    status: "pending",
    email: invitation.email,
    first_name: invitation.first_name,
    last_name: invitation.last_name,
    role: invitation.role,
    expires_at: invitation.expires_at,
  });
}

/** Public: accept invitation and create password-backed account. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body?.token || "").trim();
  const password = String(body?.password || "");
  const confirm = String(body?.confirm_password || "");

  if (!token) {
    return NextResponse.json({ detail: "Missing invitation token." }, { status: 400 });
  }

  const passwordCheck = validatePasswordChange({
    currentPassword: "",
    newPassword: password,
    confirmPassword: confirm,
    requireCurrent: false,
  });
  if (!passwordCheck.ok) {
    return NextResponse.json({ detail: passwordCheck.error }, { status: 400 });
  }
  const strength = validatePassword(password);
  if (!strength.ok) {
    return NextResponse.json({ detail: strength.error }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ detail: "Onboarding is not configured." }, { status: 503 });
  }

  const tokenHash = hashInviteToken(token);
  const { data: invitation, error } = await service
    .from("admin_invitations")
    .select(
      "id, email, first_name, last_name, role, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at, updated_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !invitation) {
    return NextResponse.json({ detail: "This invitation link is not valid." }, { status: 400 });
  }

  const status = invitationStatus(invitation as AdminInvitationRow);
  if (status !== "pending") {
    return NextResponse.json(
      {
        detail:
          status === "expired"
            ? "This invitation has expired. Ask an administrator to resend it."
            : status === "revoked"
              ? "This invitation was revoked."
              : "This invitation was already used.",
        status,
      },
      { status: 409 },
    );
  }

  const email = normalizeEmail(invitation.email);

  const { data: existingProfile } = await service
    .from("admin_profiles")
    .select("user_id, status")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile?.status === "active") {
    return NextResponse.json(
      { detail: "An account with this email already exists. Sign in instead." },
      { status: 409 },
    );
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: invitation.first_name,
      last_name: invitation.last_name,
      admin_role: invitation.role,
      full_name: `${invitation.first_name} ${invitation.last_name}`.trim(),
    },
  });

  if (createError || !created.user) {
    const message = createError?.message || "Could not create account.";
    if (/already|registered|exists/i.test(message)) {
      return NextResponse.json(
        { detail: "An account with this email already exists. Sign in instead." },
        { status: 409 },
      );
    }
    return NextResponse.json({ detail: message }, { status: 500 });
  }

  const userId = created.user.id;
  const now = new Date().toISOString();

  const { error: profileError } = await service.from("admin_profiles").upsert(
    {
      user_id: userId,
      email,
      first_name: invitation.first_name,
      last_name: invitation.last_name,
      role: invitation.role,
      status: "active",
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
    return NextResponse.json({ detail: "Could not activate account." }, { status: 500 });
  }

  const { error: acceptError } = await service
    .from("admin_invitations")
    .update({ accepted_at: now, updated_at: now })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (acceptError) {
    // Account exists; still report success but log.
    console.error(JSON.stringify({ scope: "onboard", stage: "accept_mark_failed", acceptError }));
  }

  await writeAuditEvent({
    action: "invitation_accepted",
    actorUserId: userId,
    targetUserId: userId,
    targetEmail: email,
    metadata: { invitation_id: invitation.id, role: invitation.role },
  });

  return NextResponse.json({
    status: "ok",
    message: "Account created. You can sign in with your email and password.",
    email,
  });
}
