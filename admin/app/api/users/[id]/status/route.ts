import { NextResponse } from "next/server";
import { requireApiAdmin, writeAuditEvent } from "@/lib/authz";
import { createServiceClient } from "@/lib/supabase/service";
import { wouldLeaveNoAdmin, type AdminProfileManaged } from "@/lib/users";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const targetUserId = params.id?.trim();
  if (!targetUserId) {
    return NextResponse.json({ detail: "User id required." }, { status: 400 });
  }
  if (targetUserId === auth.user.id) {
    return NextResponse.json(
      { detail: "You cannot deactivate your own account." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "deactivate").trim();
  if (action !== "deactivate" && action !== "reactivate") {
    return NextResponse.json({ detail: "action must be deactivate or reactivate." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ detail: "User management is not configured." }, { status: 503 });
  }

  const { data: profiles, error: listError } = await service
    .from("admin_profiles")
    .select("user_id, email, first_name, last_name, role, status, deactivated_at");

  if (listError) {
    return NextResponse.json({ detail: "Could not load users." }, { status: 500 });
  }

  const rows = (profiles || []) as AdminProfileManaged[];
  const target = rows.find((row) => row.user_id === targetUserId);
  if (!target) {
    return NextResponse.json({ detail: "User not found." }, { status: 404 });
  }

  if (action === "deactivate") {
    if (
      wouldLeaveNoAdmin({
        profiles: rows,
        targetUserId,
        nextStatus: "deactivated",
      })
    ) {
      return NextResponse.json(
        { detail: "Tina Admin must keep at least one active administrator." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { error } = await service
      .from("admin_profiles")
      .update({
        status: "deactivated",
        deactivated_at: now,
        deactivated_by: auth.user.id,
        updated_at: now,
      })
      .eq("user_id", targetUserId);

    if (error) {
      return NextResponse.json({ detail: "Could not deactivate user." }, { status: 500 });
    }

    // Best-effort session invalidation via Auth Admin API.
    try {
      await service.auth.admin.signOut(targetUserId, "global");
    } catch {
      /* ignore if unsupported */
    }

    await writeAuditEvent({
      action: "user_deactivated",
      actorUserId: auth.user.id,
      targetUserId,
      targetEmail: target.email,
    });

    return NextResponse.json({ status: "ok", message: "User deactivated." });
  }

  const now = new Date().toISOString();
  const { error } = await service
    .from("admin_profiles")
    .update({
      status: "active",
      deactivated_at: null,
      deactivated_by: null,
      updated_at: now,
    })
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ detail: "Could not reactivate user." }, { status: 500 });
  }

  await writeAuditEvent({
    action: "user_reactivated",
    actorUserId: auth.user.id,
    targetUserId,
    targetEmail: target.email,
  });

  return NextResponse.json({ status: "ok", message: "User reactivated." });
}
