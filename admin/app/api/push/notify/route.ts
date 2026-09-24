import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNeedsAttention } from "@/lib/push-server";

function isAdminEmail(email: string): boolean {
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(email.toLowerCase());
}

function bearerSecret(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || "";
}

/** Trim: Vercel env paste often includes a trailing newline; Railway already strips. */
function configuredSyncSecret(): string {
  return (process.env.ADMIN_SYNC_SECRET || "").trim();
}

/**
 * Trigger Web Push for a Needs attention transition.
 * Auth: logged-in admin session OR ADMIN_SYNC_SECRET (Railway → Vercel).
 */
export async function POST(request: Request) {
  const secret = configuredSyncSecret();
  const provided = bearerSecret(request);
  let authorized = Boolean(secret && provided && provided === secret);

  if (!authorized) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email && isAdminEmail(user.email)) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const interactionId = String(payload?.interaction_id || "").trim();
  if (!interactionId) {
    return NextResponse.json({ detail: "interaction_id required" }, { status: 400 });
  }

  try {
    const result = await notifyNeedsAttention(interactionId);
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    console.info(
      JSON.stringify({
        scope: "push",
        stage: "notify_route_error",
        interactionId,
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    // Never break callers — soft success with failure count.
    return NextResponse.json({
      status: "ok",
      notified: 0,
      skipped: 0,
      failed: 1,
      reason: "exception",
    });
  }
}
