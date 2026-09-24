import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validatePushSubscriptionPayload } from "@/lib/notifications";

function isAdminEmail(email: string): boolean {
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(email.toLowerCase());
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validatePushSubscriptionPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ detail: parsed.error }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent") || null;
  const { error } = await supabase.from("admin_push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.endpoint,
      p256dh: parsed.p256dh,
      auth: parsed.auth,
      user_agent: userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.info(
      JSON.stringify({
        scope: "push",
        stage: "subscribe_error",
        code: error.code,
        userId: user.id,
      }),
    );
    return NextResponse.json({ detail: "Could not save subscription" }, { status: 500 });
  }

  console.info(
    JSON.stringify({ scope: "push", stage: "subscribed", userId: user.id }),
  );
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) {
    return NextResponse.json({ detail: "endpoint required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("admin_push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ detail: "Could not remove subscription" }, { status: 500 });
  }

  console.info(
    JSON.stringify({ scope: "push", stage: "unsubscribed", userId: user.id }),
  );
  return NextResponse.json({ status: "ok" });
}
