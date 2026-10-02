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

/**
 * Proxy manual Needs attention flags to Railway → Slack #tina-needs-attention.
 * Keeps ADMIN_SYNC_SECRET server-side (same pattern as /api/reply).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = (process.env.NEXT_PUBLIC_TINA_API_URL || "").replace(/\/$/, "");
  const secret = (process.env.ADMIN_SYNC_SECRET || "").trim();
  if (!apiUrl || !secret) {
    return NextResponse.json(
      {
        detail:
          "Slack notify is not configured. Set NEXT_PUBLIC_TINA_API_URL and ADMIN_SYNC_SECRET.",
      },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const interactionId = String(payload?.interaction_id || "").trim();
  if (!interactionId) {
    return NextResponse.json({ detail: "interaction_id required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiUrl}/admin/slack/needs-attention`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ interaction_id: interactionId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { detail: (body as { detail?: string }).detail || "Railway Slack notify failed" },
        { status: response.status },
      );
    }
    return NextResponse.json({ status: "ok", ...body });
  } catch (error) {
    console.info(
      JSON.stringify({
        scope: "slack",
        stage: "admin_proxy_error",
        interactionId,
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    // Soft success — flagging must not fail because Slack is down.
    return NextResponse.json({
      status: "ok",
      posted: false,
      reason: "exception",
    });
  }
}
