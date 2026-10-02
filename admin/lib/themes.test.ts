import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_UI_THEME,
  isLimeLicorice,
  normalizeUiTheme,
  parseUiTheme,
  UI_THEME_LABELS,
} from "./themes.ts";

describe("ui theme helpers", () => {
  it("parses known theme ids", () => {
    assert.equal(parseUiTheme("lime_licorice"), "lime_licorice");
    assert.equal(parseUiTheme("green_garden"), "green_garden");
    assert.equal(parseUiTheme("neon"), null);
  });

  it("defaults unknown values to Lime Licorice", () => {
    assert.equal(normalizeUiTheme(undefined), DEFAULT_UI_THEME);
    assert.equal(normalizeUiTheme("nope"), "lime_licorice");
    assert.equal(isLimeLicorice("lime_licorice"), true);
    assert.equal(isLimeLicorice("green_garden"), false);
    assert.equal(UI_THEME_LABELS.green_garden, "Green Garden");
  });
});
