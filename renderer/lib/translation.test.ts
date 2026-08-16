import assert from "node:assert/strict";
import test from "node:test";
import { baseLanguage, canAutoTranslatePost, isSameLanguage } from "./translation";

const eligible = {
  textLength: 120,
  sourceLanguage: "fr",
  targetLanguage: "en",
  hasContentWarning: false,
  sensitive: false,
  hasMedia: false,
  hasCard: false,
  isArticle: false,
  hasFilterWarning: false,
};

test("normalizes regional language codes", () => {
  assert.equal(baseLanguage("EN_us"), "en");
  assert.equal(isSameLanguage("en-GB", "en-US"), true);
});

test("allows a short, simple post in another or unknown language", () => {
  assert.equal(canAutoTranslatePost(eligible), true);
  assert.equal(canAutoTranslatePost({ ...eligible, sourceLanguage: null }), true);
});

test("blocks complex, hidden, sensitive, or same-language posts", () => {
  const overrides: Array<Partial<typeof eligible>> = [
    { textLength: 501 }, { sourceLanguage: "en-GB" }, { hasContentWarning: true },
    { sensitive: true }, { hasMedia: true }, { hasCard: true }, { isArticle: true },
    { hasFilterWarning: true },
  ];
  for (const override of overrides) {
    assert.equal(canAutoTranslatePost({ ...eligible, ...override }), false);
  }
});
