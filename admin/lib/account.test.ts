import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  avatarInitial,
  displayFirstName,
  isAdminRole,
  parseAdminRole,
  roleLabel,
  validateAvatarFile,
  validatePassword,
  validatePasswordChange,
  validateProfileFields,
} from "./account.ts";

describe("display helpers", () => {
  it("prefers first name then email local-part", () => {
    assert.equal(displayFirstName({ first_name: "Fredrik", email: "a@b.com" }), "Fredrik");
    assert.equal(displayFirstName({ first_name: "  ", email: "fredrik@school.edu" }), "fredrik");
    assert.equal(avatarInitial({ first_name: "Fredrik", email: "a@b.com" }), "F");
    assert.equal(roleLabel("admin"), "Admin");
    assert.equal(roleLabel("member"), "Member");
  });
});

describe("profile validation", () => {
  it("requires first name and email", () => {
    assert.equal(
      validateProfileFields({ firstName: "", lastName: "X", email: "a@b.com" }).ok,
      false,
    );
    assert.equal(
      validateProfileFields({ firstName: "Fredrik", lastName: "", email: "a@b.com" }).ok,
      true,
    );
  });
});

describe("avatar validation", () => {
  it("accepts supported images under 10 MB", () => {
    assert.equal(validateAvatarFile({ type: "image/png", size: 1024 }).ok, true);
  });

  it("rejects unsupported types and oversized files", () => {
    assert.equal(validateAvatarFile({ type: "image/svg+xml", size: 10 }).ok, false);
    assert.equal(
      validateAvatarFile({ type: "image/jpeg", size: 11 * 1024 * 1024 }).ok,
      false,
    );
  });
});

describe("password validation", () => {
  it("enforces length and letter+number", () => {
    assert.equal(validatePassword("short1").ok, false);
    assert.equal(validatePassword("longenough").ok, false);
    assert.equal(validatePassword("longenough1").ok, true);
  });

  it("requires match and optional current password", () => {
    assert.equal(
      validatePasswordChange({
        currentPassword: "",
        newPassword: "Password1",
        confirmPassword: "Password1",
        requireCurrent: true,
      }).ok,
      false,
    );
    assert.equal(
      validatePasswordChange({
        currentPassword: "Oldpass1",
        newPassword: "Password1",
        confirmPassword: "Password2",
        requireCurrent: true,
      }).ok,
      false,
    );
    assert.equal(
      validatePasswordChange({
        currentPassword: "Oldpass1",
        newPassword: "Password1",
        confirmPassword: "Password1",
        requireCurrent: true,
      }).ok,
      true,
    );
  });
});

describe("roles", () => {
  it("parses and detects admin", () => {
    assert.equal(parseAdminRole("admin"), "admin");
    assert.equal(parseAdminRole("guest"), null);
    assert.equal(isAdminRole("admin"), true);
    assert.equal(isAdminRole("member"), false);
  });
});
