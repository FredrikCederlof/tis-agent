import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUserList,
  countActiveAdmins,
  invitationStatus,
  normalizeEmail,
  onboardUrl,
  validateInviteFields,
  wouldLeaveNoAdmin,
  type AdminInvitationRow,
  type AdminProfileManaged,
} from "./users.ts";
import { generateInviteToken, hashInviteToken } from "./invite-tokens.ts";
import { isPublicPath, isApiPath } from "./middleware-paths.ts";

describe("invite validation", () => {
  it("requires names, email, and role", () => {
    assert.equal(
      validateInviteFields({
        firstName: "",
        lastName: "A",
        email: "a@b.com",
        role: "member",
      }).ok,
      false,
    );
    assert.equal(
      validateInviteFields({
        firstName: "Anna",
        lastName: "Lee",
        email: "anna@school.edu",
        role: "member",
      }).ok,
      true,
    );
  });

  it("normalizes email and hashes tokens", () => {
    assert.equal(normalizeEmail("  A@B.Com "), "a@b.com");
    const { token, tokenHash } = generateInviteToken();
    assert.equal(tokenHash, hashInviteToken(token));
    assert.notEqual(token, tokenHash);
  });
});

describe("invitation status", () => {
  const base: AdminInvitationRow = {
    id: "1",
    email: "a@b.com",
    first_name: "A",
    last_name: "B",
    role: "member",
    token_hash: "x",
    invited_by: null,
    expires_at: "2099-01-01T00:00:00Z",
    accepted_at: null,
    revoked_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("detects pending, expired, revoked, accepted", () => {
    assert.equal(invitationStatus(base), "pending");
    assert.equal(
      invitationStatus({ ...base, expires_at: "2020-01-01T00:00:00Z" }),
      "expired",
    );
    assert.equal(
      invitationStatus({ ...base, revoked_at: "2026-01-02T00:00:00Z" }),
      "revoked",
    );
    assert.equal(
      invitationStatus({ ...base, accepted_at: "2026-01-02T00:00:00Z" }),
      "accepted",
    );
  });
});

describe("user list + last admin", () => {
  const profiles: AdminProfileManaged[] = [
    {
      user_id: "1",
      email: "admin@school.edu",
      first_name: "Ada",
      last_name: "Admin",
      role: "admin",
      status: "active",
      deactivated_at: null,
    },
    {
      user_id: "2",
      email: "member@school.edu",
      first_name: "Mo",
      last_name: "Member",
      role: "member",
      status: "active",
      deactivated_at: null,
    },
  ];

  it("merges pending invitations and hides accepted/revoked", () => {
    const invitations: AdminInvitationRow[] = [
      {
        id: "inv1",
        email: "new@school.edu",
        first_name: "New",
        last_name: "User",
        role: "member",
        token_hash: "h",
        invited_by: "1",
        expires_at: "2099-01-01T00:00:00Z",
        accepted_at: null,
        revoked_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "inv2",
        email: "old@school.edu",
        first_name: "Old",
        last_name: "Invite",
        role: "member",
        token_hash: "h2",
        invited_by: "1",
        expires_at: "2099-01-01T00:00:00Z",
        accepted_at: "2026-01-02T00:00:00Z",
        revoked_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ];
    const list = buildUserList({ profiles, invitations });
    assert.equal(list.some((row) => row.email === "new@school.edu"), true);
    assert.equal(list.some((row) => row.email === "old@school.edu"), false);
    assert.equal(countActiveAdmins(profiles), 1);
  });

  it("blocks demoting or deactivating the last admin", () => {
    assert.equal(
      wouldLeaveNoAdmin({
        profiles,
        targetUserId: "1",
        nextRole: "member",
      }),
      true,
    );
    assert.equal(
      wouldLeaveNoAdmin({
        profiles,
        targetUserId: "1",
        nextStatus: "deactivated",
      }),
      true,
    );
    assert.equal(
      wouldLeaveNoAdmin({
        profiles,
        targetUserId: "2",
        nextStatus: "deactivated",
      }),
      false,
    );
  });
});

describe("onboard url", () => {
  it("embeds the token", () => {
    const url = onboardUrl("abc", "https://admin.example.com");
    assert.equal(url, "https://admin.example.com/onboard?token=abc");
  });
});

describe("middleware public paths", () => {
  it("allows onboard and push notify without session", () => {
    assert.equal(isPublicPath("/onboard"), true);
    assert.equal(isPublicPath("/api/onboard"), true);
    assert.equal(isPublicPath("/api/push/notify"), true);
    assert.equal(isPublicPath("/users"), false);
    assert.equal(isApiPath("/api/users"), true);
  });
});
