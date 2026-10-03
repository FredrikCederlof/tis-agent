import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminAvatarMap,
  adminDisplayName,
  adminNameMap,
  isKnowledgeCandidateQuestion,
  knowledgeHubUrl,
  outcomeLabel,
  parseCitationLine,
  sourceTitles,
  stripSourceLines,
} from "./chat-presentation.ts";
import { languageInfo } from "./language-display.ts";
import { formatRemaining, replyWindow } from "./reply.ts";

describe("languageInfo", () => {
  it("maps known codes to English names and flags", () => {
    assert.equal(languageInfo("sv").code, "SV");
    assert.equal(languageInfo("sv").name, "Swedish");
    assert.equal(languageInfo("sv").flag, "🇸🇪");
    assert.equal(languageInfo("ja-JP").code, "JA");
    assert.equal(languageInfo("en").flag, "🇬🇧");
  });

  it("falls back without a flag for unknown languages", () => {
    const info = languageInfo("xx");
    assert.equal(info.code, "XX");
    assert.equal(info.flag, undefined);
    assert.match(info.name, /Language XX/);
  });
});

describe("adminDisplayName", () => {
  it("prefers profile full name over email local-part", () => {
    const names = adminNameMap([
      {
        email: "kotolynski@example.com",
        first_name: "Fredrik Sterner",
        last_name: "Cederlöf",
      },
    ]);
    assert.equal(
      adminDisplayName("kotolynski@example.com", names),
      "Fredrik Sterner Cederlöf",
    );
    assert.equal(
      adminDisplayName("Kotolynski@example.com", names),
      "Fredrik Sterner Cederlöf",
    );
  });

  it("falls back to email local-part first token", () => {
    assert.equal(adminDisplayName("fredrik@tokyois.com"), "Fredrik");
    assert.equal(adminDisplayName("jane.doe@school.edu"), "Jane");
    assert.equal(adminDisplayName(null), "Admin");
    assert.equal(adminDisplayName(""), "Admin");
  });
});

describe("adminAvatarMap", () => {
  it("maps emails with avatar_path to public URLs", () => {
    const map = adminAvatarMap(
      [
        { email: "a@b.com", avatar_path: "uid/avatar.jpg" },
        { email: "c@d.com", avatar_path: null },
      ],
      "https://example.supabase.co",
      (base, path) => (path ? `${base}/storage/v1/object/public/admin-avatars/${path}` : null),
    );
    assert.equal(
      map["a@b.com"],
      "https://example.supabase.co/storage/v1/object/public/admin-avatars/uid/avatar.jpg",
    );
    assert.equal(map["c@d.com"], undefined);
  });
});

describe("outcome and citation helpers", () => {
  it("labels outcomes in English", () => {
    assert.equal(outcomeLabel("success"), "Answered");
    assert.equal(outcomeLabel("low_confidence"), "Low confidence");
    assert.equal(outcomeLabel("no_evidence"), "AI couldn’t answer");
  });

  it("parses and strips Source citation lines", () => {
    const reply =
      'Uniforms are required on weekdays.\n\n_Source: Parent Handbook — "navy polo"_';
    const parsed = parseCitationLine('_Source: Parent Handbook — "navy polo"_');
    assert.deepEqual(parsed, { title: "Parent Handbook", quote: "navy polo" });
    const stripped = stripSourceLines(reply);
    assert.equal(stripped.body, "Uniforms are required on weekdays.");
    assert.equal(stripped.citations[0]?.title, "Parent Handbook");
  });

  it("prefers document_titles over parsed text", () => {
    const sources = sourceTitles(
      ["TIS Parent Calendar"],
      '_Source: Other Doc — "quote"_',
    );
    assert.deepEqual(sources.titles, ["TIS Parent Calendar"]);
    assert.equal(sources.quote, "quote");
  });
});

describe("knowledge hub helpers", () => {
  it("skips greetings and builds review URLs", () => {
    assert.equal(isKnowledgeCandidateQuestion("Hi"), false);
    assert.equal(isKnowledgeCandidateQuestion("When is sports day next week?"), true);
    assert.equal(
      knowledgeHubUrl("abc", { answer: "Yes" }),
      "/knowledge/new?from=abc&answer=Yes",
    );
  });
});

describe("reply window labels", () => {
  it("uses compact closed / open wording", () => {
    assert.equal(formatRemaining(0), "24h reply window closed");
    assert.equal(formatRemaining(18 * 3600), "24h window — 18h left");
    assert.equal(formatRemaining(35 * 60), "24h window — 35m left");
    const closed = replyWindow(new Date(Date.now() - 25 * 3600 * 1000).toISOString());
    assert.equal(closed.open, false);
    assert.equal(closed.label, "24h reply window closed");
  });
});
