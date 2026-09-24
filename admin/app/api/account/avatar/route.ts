import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAdminProfile } from "@/lib/ensure-profile";
import {
  AVATAR_BUCKET,
  validateAvatarFile,
} from "@/lib/account";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }

  await ensureAdminProfile(supabase, user);

  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "Choose an image to upload." }, { status: 400 });
  }

  const validated = validateAvatarFile({ type: file.type, size: file.size });
  if (!validated.ok) {
    return NextResponse.json({ detail: validated.error }, { status: 400 });
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const path = `${user.id}/avatar.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { detail: `Could not upload image: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { error: profileError } = await supabase
    .from("admin_profiles")
    .update({
      avatar_path: path,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (profileError) {
    return NextResponse.json({ detail: "Image uploaded but profile was not updated." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", avatar_path: path, message: "Profile image saved." });
}
