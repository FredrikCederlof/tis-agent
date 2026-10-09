/** Path helpers shared by middleware and unit tests. */

export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname === "/privacy" ||
    pathname.startsWith("/pages/") ||
    pathname.startsWith("/onboard") ||
    pathname.startsWith("/api/onboard") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/preview-login") ||
    pathname === "/favicon.ico" ||
    // Service worker must load without a session so Chrome can install/update it
    // and deliver Web Push when the admin tab is closed or the cookie expired.
    pathname === "/sw.js" ||
    // Railway calls this with ADMIN_SYNC_SECRET (no session cookie).
    // Auth is enforced inside the route handler.
    pathname === "/api/push/notify"
  );
}

/** API routes should get JSON 401s, not HTML login redirects. */
export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}
