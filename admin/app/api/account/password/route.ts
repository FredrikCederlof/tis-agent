import { NextResponse } from "next/server";
import { createClient as createBrowserLikeClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validatePasswordChange } from "@/lib/account";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body?.current_password || "");
  const newPassword = String(body?.new_password || "");
  const confirmPassword = String(body?.confirm_password || "");
  const requireCurrent = Boolean(body?.require_current ?? true);

  const validated = validatePasswordChange({
    currentPassword,
    newPassword,
    confirmPassword,
    requireCurrent,
  });
  if (!validated.ok) {
    return NextResponse.json({ detail: validated.error }, { status: 400 });
  }

  if (requireCurrent || currentPassword) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ detail: "Auth is not configured." }, { status: 503 });
    }
    // Verify current password with a disposable client so we do not disturb the session cookies.
    const verifier = createBrowserLikeClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: verifyError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      return NextResponse.json(
        { detail: "Current password is incorrect." },
        { status: 400 },
      );
    }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return NextResponse.json(
      { detail: error.message || "Could not update password." },
      { status: 400 },
    );
  }

  return NextResponse.json({ status: "ok", message: "Password updated." });
}
