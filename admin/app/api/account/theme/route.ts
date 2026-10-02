import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAdminProfile } from "@/lib/ensure-profile";
import { parseUiTheme, UI_THEME_LABELS } from "@/lib/themes";

/** Save per-user Admin UI theme preference. */
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
  const theme = parseUiTheme(body?.ui_theme);
  if (!theme) {
    return NextResponse.json(
      { detail: "ui_theme must be lime_licorice or green_garden." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("admin_profiles")
    .update({
      ui_theme: theme,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ detail: "Could not save theme." }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    message: `Theme set to ${UI_THEME_LABELS[theme]}.`,
    ui_theme: theme,
  });
}
