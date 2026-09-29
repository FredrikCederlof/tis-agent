import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isEnglishLanguage,
  looksLikeEnglish,
  shouldTranslateForAdmin,
} from "./admin-translate.ts";
import { PARENT_AVATARS, parentAvatar, parentAvatarIndex } from "./parent-avatars.ts";

describe("parent animal avatars", () => {
  it("keeps a stable animal for the same WhatsApp number", () => {
    assert.equal(PARENT_AVATARS.length, 15);
    assert.equal(parentAvatarIndex("46704127043"), parentAvatarIndex("46704127043"));
    assert.equal(parentAvatar("46704127043").id, parentAvatar("46704127043").id);
    assert.notEqual(parentAvatar("46704127043").id, parentAvatar("46709999999").id);
  });
});

describe("admin translation helpers", () => {
  it("skips English language and English-looking text", () => {
    assert.equal(isEnglishLanguage("en"), true);
    assert.equal(isEnglishLanguage("sv"), false);
    assert.equal(looksLikeEnglish("Where can I buy school sweaters?"), true);
    assert.equal(looksLikeEnglish("Var köper man skoltröjor?"), false);
    assert.equal(shouldTranslateForAdmin("Var köper man skoltröjor?", "sv"), true);
    assert.equal(shouldTranslateForAdmin("Where can I buy school sweaters?", "sv"), false);
    assert.equal(shouldTranslateForAdmin("Var köper man skoltröjor?", "en"), false);
  });
});
