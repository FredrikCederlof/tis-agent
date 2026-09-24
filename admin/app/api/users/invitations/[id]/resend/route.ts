import { NextResponse } from "next/server";
import { displayFirstName } from "@/lib/account";
import { requireApiAdmin, writeAuditEvent } from "@/lib/authz";
import { sendInvitationEmail } from "@/lib/resend";
import { createServiceClient } from "@/lib/supabase/service";
import {
  INVITE_RATE_LIMIT_PER_HOUR,
  inviteExpiresAt,
  invitationStatus,
  onboardUrl,
  type AdminInvitationRow,
} from "@/lib/users";
import { generateInviteToken } from "@/lib/invite-tokens";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const invitationId = params.id?.trim();
  if (!invitationId) {
    return NextResponse.json({ detail: "Invitation id required." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ detail: "User management is not configured." }, { status: 503 });
  }

  const { count: recentCount } = await service
    .from("admin_invitations")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", auth.user.id)
    .gte("updated_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((recentCount ?? 0) >= INVITE_RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { detail: "Too many invitation actions in the last hour. Try again later." },
      { status: 429 },
    );
  }

  const { data: invitation, error } = await service
    .from("admin_invitations")
    .select(
      "id, email, first_name, last_name, role, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at, updated_at",
    )
    .eq("id", invitationId)
    .maybeSingle();

  if (error || !invitation) {
    return NextResponse.json({ detail: "Invitation not found." }, { status: 404 });
  }

  const status = invitationStatus(invitation as AdminInvitationRow);
  if (status === "accepted") {
    return NextResponse.json({ detail: "This invitation was already accepted." }, { status: 409 });
  }
  if (status === "revoked") {
    return NextResponse.json({ detail: "This invitation was revoked." }, { status: 409 });
  }

  const { token, tokenHash } = generateInviteToken();
  const expires = inviteExpiresAt();
  const now = new Date().toISOString();

  const { error: updateError } = await service
    .from("admin_invitations")
    .update({
      token_hash: tokenHash,
      expires_at: expires.toISOString(),
      revoked_at: null,
      updated_at: now,
    })
    .eq("id", invitationId);

  if (updateError) {
    return NextResponse.json({ detail: "Could not refresh invitation." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const sent = await sendInvitationEmail({
    to: invitation.email,
    firstName: invitation.first_name,
    role: invitation.role,
    invitedByName: displayFirstName(auth.profile),
    onboardUrl: onboardUrl(token, origin),
    expiresAt: expires,
  });

  if (!sent.ok) {
    return NextResponse.json({ detail: sent.error }, { status: 502 });
  }

  await writeAuditEvent({
    action: "invitation_resent",
    actorUserId: auth.user.id,
    targetEmail: invitation.email,
    metadata: { invitation_id: invitationId },
  });

  return NextResponse.json({ status: "ok", message: "Invitation resent." });
}
