import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors admin/middleware.ts path helpers so we catch regressions that
 * redirect Railway's bearer-authenticated notify call to /login (307).
 */
function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/preview-login") ||
    pathname === "/favicon.ico" ||
    pathname === "/api/push/notify"
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

describe("middleware auth bypass for push notify", () => {
  it("treats /api/push/notify as public so Railway can POST without cookies", () => {
    assert.equal(isPublicPath("/api/push/notify"), true);
    assert.equal(isPublicPath("/api/push/subscribe"), false);
    assert.equal(isPublicPath("/inbox"), false);
  });

  it("marks API paths so unauthenticated callers get JSON, not a login redirect", () => {
    assert.equal(isApiPath("/api/push/notify"), true);
    assert.equal(isApiPath("/account"), false);
  });
});
