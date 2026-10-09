import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyContentTokens,
  publicPageHref,
  sanitizeHtml,
  validateSlug,
} from "./content-pages.ts";

describe("content pages", () => {
  it("keeps the privacy notice on its existing address", () => {
    assert.equal(publicPageHref("privacy"), "/privacy");
    assert.equal(publicPageHref("school-week"), "/pages/school-week");
  });

  it("rejects reserved and messy slugs", () => {
    assert.equal(validateSlug("school-week"), null);
    assert.equal(validateSlug("Settings"), "Use lowercase letters, numbers, and hyphens.");
    assert.equal(validateSlug("login"), "That address is reserved.");
  });

  it("replaces the retention token and strips scripts", () => {
    assert.equal(
      applyContentTokens("Kept for {retention_days} days. {privacy_contact_email}", 90, "a@b.se"),
      "Kept for 90 days. a@b.se",
    );
    const clean = sanitizeHtml(
      '<p onclick="alert(1)">Hello</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
    );
    assert.equal(clean.includes("script"), false);
    assert.equal(clean.includes("onclick"), false);
    assert.equal(clean.includes("javascript:"), false);
    assert.match(clean, /<p>Hello<\/p>/);
  });
});
