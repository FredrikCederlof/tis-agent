import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { displayFirstName } from "@/lib/account";
import { requireApiAdmin, writeAuditEvent } from "@/lib/authz";
import { sendInvitationEmail } from "@/lib/resend";
import {
  INVITE_RATE_LIMIT_PER_HOUR,
  inviteExpiresAt,
  invitationStatus,
  normalizeEmail,
  onboardUrl,
  validateInviteFields,
  type AdminInvitationRow,
} from "@/lib/users";
import { generateInviteToken } from "@/lib/invite-tokens";

export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ detail: "User management is not configured." }, { status: 503 });
  }

  const [{ data: profiles, error: profileError }, { data: invitations, error: inviteError }] =
    await Promise.all([
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

  if (profileError || inviteError) {
    return NextResponse.json({ detail: "Could not load users." }, { status: 500 });
  }

  return NextResponse.json({
    profiles: profiles || [],
    invitations: invitations || [],
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const validated = validateInviteFields({
    firstName: String(body?.first_name || ""),
    lastName: String(body?.last_name || ""),
    email: String(body?.email || ""),
    role: body?.role,
  });
  if (!validated.ok) {
    return NextResponse.json({ detail: validated.error }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ detail: "User management is not configured." }, { status: 503 });
  }

  const email = validated.email;

  const { count: recentCount } = await service
    .from("admin_invitations")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", auth.user.id)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((recentCount ?? 0) >= INVITE_RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { detail: "Too many invitations in the last hour. Try again later." },
      { status: 429 },
    );
  }

  const { data: existingProfile } = await service
    .from("admin_profiles")
    .select("user_id, status")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile?.status === "active") {
    return NextResponse.json(
      { detail: "An active user with this email already exists." },
      { status: 409 },
    );
  }

  const { data: openInvites } = await service
    .from("admin_invitations")
    .select(
      "id, email, first_name, last_name, role, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at, updated_at",
    )
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const now = new Date();
  const pending = (openInvites || []).find(
    (row) => invitationStatus(row as AdminInvitationRow, now) === "pending",
  );
  if (pending) {
    return NextResponse.json(
      { detail: "A pending invitation already exists for this email." },
      { status: 409 },
    );
  }

  const { token, tokenHash } = generateInviteToken();
  const expires = inviteExpiresAt();
  const { data: invitation, error } = await service
    .from("admin_invitations")
    .insert({
      email,
      first_name: String(body.first_name).trim(),
      last_name: String(body.last_name).trim(),
      role: validated.role,
      token_hash: tokenHash,
      invited_by: auth.user.id,
      expires_at: expires.toISOString(),
      updated_at: now.toISOString(),
    })
    .select("id, email, first_name, last_name, role, expires_at")
    .single();

  if (error || !invitation) {
    return NextResponse.json({ detail: "Could not create invitation." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const link = onboardUrl(token, origin);
  const invitedByName = displayFirstName(auth.profile);
  const sent = await sendInvitationEmail({
    to: email,
    firstName: invitation.first_name,
    role: validated.role,
    invitedByName,
    onboardUrl: link,
    expiresAt: expires,
  });

  if (!sent.ok) {
    await service.from("admin_invitations").delete().eq("id", invitation.id);
    return NextResponse.json({ detail: sent.error }, { status: 502 });
  }

  await writeAuditEvent({
    action: "invitation_created",
    actorUserId: auth.user.id,
    targetEmail: email,
    metadata: { invitation_id: invitation.id, role: validated.role },
  });

  return NextResponse.json({
    status: "ok",
    message: "Invitation sent.",
    invitation: {
      id: invitation.id,
      email: invitation.email,
      first_name: invitation.first_name,
      last_name: invitation.last_name,
      role: invitation.role,
      expires_at: invitation.expires_at,
    },
  });
}
