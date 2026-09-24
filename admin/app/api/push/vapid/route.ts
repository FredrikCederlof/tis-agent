import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isAdminEmail(email: string): boolean {
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(email.toLowerCase());
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  if (!publicKey) {
    return NextResponse.json({ detail: "VAPID not configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
}
