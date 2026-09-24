import { NextResponse } from "next/server";
import { parseAdminRole } from "@/lib/account";
import { requireApiAdmin, writeAuditEvent } from "@/lib/authz";
import { createServiceClient } from "@/lib/supabase/service";
import { wouldLeaveNoAdmin, type AdminProfileManaged } from "@/lib/users";

/**
 * Administrators only: assign another user's role.
 * Callers cannot change their own role through this endpoint.
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const targetUserId = String(body?.user_id || "").trim();
  const role = parseAdminRole(body?.role);
  if (!targetUserId || !role) {
    return NextResponse.json({ detail: "user_id and role are required." }, { status: 400 });
  }
  if (targetUserId === auth.user.id) {
    return NextResponse.json(
      { detail: "You cannot change your own role." },
      { status: 400 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ detail: "Role updates are not configured." }, { status: 503 });
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

  if (
    wouldLeaveNoAdmin({
      profiles: rows,
      targetUserId,
      nextRole: role,
    })
  ) {
    return NextResponse.json(
      { detail: "Tina Admin must keep at least one active administrator." },
      { status: 400 },
    );
  }

  const { error } = await service
    .from("admin_profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ detail: "Could not update role." }, { status: 500 });
  }

  await writeAuditEvent({
    action: "role_changed",
    actorUserId: auth.user.id,
    targetUserId,
    targetEmail: target.email,
    metadata: { from: target.role, to: role },
  });

  return NextResponse.json({ status: "ok", message: "Role updated." });
}
