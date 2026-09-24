import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAdminProfile } from "@/lib/ensure-profile";
import { isAdminRole, parseAdminRole } from "@/lib/account";

/**
 * Administrators only: assign another user's role.
 * Callers cannot change their own role through this endpoint.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }

  const caller = await ensureAdminProfile(supabase, user);
  if (!isAdminRole(caller.role)) {
    return NextResponse.json(
      { detail: "Only administrators can change roles." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const targetUserId = String(body?.user_id || "").trim();
  const role = parseAdminRole(body?.role);
  if (!targetUserId || !role) {
    return NextResponse.json({ detail: "user_id and role are required." }, { status: 400 });
  }
  if (targetUserId === user.id) {
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

  const { data: target, error: loadError } = await service
    .from("admin_profiles")
    .select("user_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (loadError || !target) {
    return NextResponse.json({ detail: "User not found." }, { status: 404 });
  }

  const { error } = await service
    .from("admin_profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ detail: "Could not update role." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", message: "Role updated." });
}
