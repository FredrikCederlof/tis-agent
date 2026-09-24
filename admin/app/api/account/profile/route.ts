import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAdminProfile } from "@/lib/ensure-profile";
import { validateProfileFields } from "@/lib/account";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }

  await ensureAdminProfile(supabase, user);

  const body = await request.json().catch(() => ({}));
  const firstName = String(body?.first_name || "").trim();
  const lastName = String(body?.last_name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();

  const validated = validateProfileFields({ firstName, lastName, email });
  if (!validated.ok) {
    return NextResponse.json({ detail: validated.error }, { status: 400 });
  }

  // Never accept role from the client on this endpoint.
  const { error: profileError } = await supabase
    .from("admin_profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (profileError) {
    return NextResponse.json({ detail: "Could not save profile." }, { status: 500 });
  }

  let emailNotice: string | null = null;
  if (email !== (user.email || "").toLowerCase()) {
    const { error: emailError } = await supabase.auth.updateUser({ email });
    if (emailError) {
      return NextResponse.json(
        {
          detail: `Name saved, but email could not be updated: ${emailError.message}`,
          partial: true,
        },
        { status: 400 },
      );
    }
    emailNotice = "Check your inbox to confirm the new email address.";
  }

  return NextResponse.json({
    status: "ok",
    message: emailNotice || "Profile saved.",
  });
}
