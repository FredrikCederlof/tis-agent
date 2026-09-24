import { NextResponse } from "next/server";
import { requireApiAdmin, writeAuditEvent } from "@/lib/authz";
import { createServiceClient } from "@/lib/supabase/service";
import { invitationStatus, type AdminInvitationRow } from "@/lib/users";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
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
    return NextResponse.json({ detail: "Invitation already revoked." }, { status: 200 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await service
    .from("admin_invitations")
    .update({ revoked_at: now, updated_at: now })
    .eq("id", invitationId);

  if (updateError) {
    return NextResponse.json({ detail: "Could not revoke invitation." }, { status: 500 });
  }

  await writeAuditEvent({
    action: "invitation_revoked",
    actorUserId: auth.user.id,
    targetEmail: invitation.email,
    metadata: { invitation_id: invitationId },
  });

  return NextResponse.json({ status: "ok", message: "Invitation revoked." });
}
