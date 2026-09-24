import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAdminProfile } from "@/lib/ensure-profile";

/** Save Needs attention notification privacy preference. */
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
  if (typeof body?.notify_message_previews !== "boolean") {
    return NextResponse.json(
      { detail: "notify_message_previews must be true or false." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("admin_profiles")
    .update({
      notify_message_previews: body.notify_message_previews,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ detail: "Could not save preference." }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    message: body.notify_message_previews
      ? "Message previews enabled for notifications."
      : "Message previews disabled for notifications.",
    notify_message_previews: body.notify_message_previews,
  });
}
