import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicPath, isApiPath } from "./middleware-paths.ts";

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

  it("treats onboarding as public", () => {
    assert.equal(isPublicPath("/onboard"), true);
    assert.equal(isPublicPath("/api/onboard"), true);
  });
});
