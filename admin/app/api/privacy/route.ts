import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/authz";

/** Admin session stays here. ADMIN_SYNC_SECRET is only used server-side. */
export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const apiUrl = (process.env.NEXT_PUBLIC_TINA_API_URL || "").replace(/\/$/, "");
  const secret = (process.env.ADMIN_SYNC_SECRET || "").trim();
  if (!apiUrl || !secret) {
    return NextResponse.json(
      { detail: "Privacy actions are not configured. Set NEXT_PUBLIC_TINA_API_URL and ADMIN_SYNC_SECRET." },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const action = String(payload?.action || "").trim();
  const actor = auth.user.email || "admin";

  let path = "";
  let body: Record<string, unknown> = { actor };
  if (action === "purge") {
    path = "/admin/privacy/purge";
  } else if (action === "export" || action === "delete") {
    const phone = String(payload?.phone || "").trim();
    if (!phone) {
      return NextResponse.json({ detail: "Phone number is required" }, { status: 400 });
    }
    path = "/admin/privacy/subject";
    body = { actor, phone, action };
  } else {
    return NextResponse.json({ detail: "Action must be purge, export, or delete" }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
