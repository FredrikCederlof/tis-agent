import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Local-only preview login for Cloud Agent / Cursor browser.
 * Gated by ALLOW_LOCAL_PREVIEW=1 — never enable in production.
 */
export async function GET(request: Request) {
  if (process.env.ALLOW_LOCAL_PREVIEW !== "1") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const incoming = new URL(request.url);
  // next dev -H 0.0.0.0 reports host 0.0.0.0; browsers need 127.0.0.1 / localhost.
  const host =
    incoming.hostname === "0.0.0.0" || incoming.hostname === "::"
      ? "127.0.0.1"
      : incoming.hostname;
  const origin = `${incoming.protocol}//${host}${incoming.port ? `:${incoming.port}` : ""}`;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = (process.env.ADMIN_EMAILS || "").split(",")[0]?.trim();
  if (!email) {
    return new NextResponse("Preview login failed: set ADMIN_EMAILS", { status: 500 });
  }

  if (!url || !serviceKey || !anonKey) {
    return NextResponse.redirect(new URL("/login?error=misconfigured", origin));
  }

  const genRes = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "magiclink",
      email,
      redirect_to: `${origin}/auth/callback`,
    }),
  });

  if (!genRes.ok) {
    const detail = await genRes.text();
    return new NextResponse(`Preview login failed: ${detail}`, { status: 500 });
  }

  const generated = (await genRes.json()) as { hashed_token?: string };
  const tokenHash = generated.hashed_token;
  if (!tokenHash) {
    return new NextResponse("Preview login failed: no hashed_token", { status: 500 });
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL("/", origin));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });

  if (error) {
    return new NextResponse(`Preview login failed: ${error.message}`, { status: 500 });
  }

  return response;
}
