import { createClient } from "@supabase/supabase-js";

/** Service-role client for push delivery (bypasses RLS). Never expose to the browser. */
export function createServiceClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) {
    throw new Error(
      `SUPABASE_URL/SECRET_KEY missing for push service client (hasUrl=${Boolean(url)} hasKey=${Boolean(key)})`,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
