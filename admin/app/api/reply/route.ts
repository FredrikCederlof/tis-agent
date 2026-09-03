import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The admin session is verified here, so ADMIN_SYNC_SECRET never reaches the browser.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const email = (user.email || "").toLowerCase();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return NextResponse.json({ detail: "Not allowed to reply" }, { status: 403 });
  }

  const apiUrl = (process.env.NEXT_PUBLIC_TINA_API_URL || "").replace(/\/$/, "");
  const secret = process.env.ADMIN_SYNC_SECRET || "";
  if (!apiUrl || !secret) {
    return NextResponse.json(
      {
        detail:
          "Replies are not configured. Set NEXT_PUBLIC_TINA_API_URL and ADMIN_SYNC_SECRET.",
      },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const interactionId = String(payload?.interaction_id || "").trim();
  const body = String(payload?.body || "").trim();
  if (!interactionId || !body) {
    return NextResponse.json(
      { detail: "interaction_id and body are required" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${apiUrl}/admin/reply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interaction_id: interactionId,
        body,
        sent_by: user.email || "",
      }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        detail: `Could not reach Tina’s WhatsApp service: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      },
      { status: 502 },
    );
  }
}
