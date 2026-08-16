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

test("allows a short, simple post in a known, different language", () => {
  assert.equal(canAutoTranslatePost(eligible), true);
});

// A post with no declared language is common (plenty of ActivityPub
// software never sets it) and used to auto-translate anyway — "unknown"
// was treated the same as "definitely different", which meant an
// untagged post already in the reader's own language got auto-translated
// too. "We don't know" must not auto-translate; the manual Translate
// button is unaffected and still works on it.
test("does not auto-translate a post with no declared language", () => {
  assert.equal(canAutoTranslatePost({ ...eligible, sourceLanguage: null }), false);
  assert.equal(canAutoTranslatePost({ ...eligible, sourceLanguage: undefined }), false);
  assert.equal(canAutoTranslatePost({ ...eligible, sourceLanguage: "" }), false);
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
