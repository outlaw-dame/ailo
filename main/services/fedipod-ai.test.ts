import assert from "node:assert/strict";
import test from "node:test";

import {
  mapAiStatus,
  mapFilterMatches,
  mapHashtagSuggestions,
  mapModerationSuggestions,
  mapTranslation,
} from "./fedipod-ai.js";

test("maps AI status, tolerating a missing/non-boolean enabled field", () => {
  assert.deepEqual(mapAiStatus({ enabled: true }), { enabled: true });
  assert.deepEqual(mapAiStatus({ enabled: "true" }), { enabled: false });
  assert.deepEqual(mapAiStatus({}), { enabled: false });
  assert.deepEqual(mapAiStatus(null), { enabled: false });
});

test("maps hashtag suggestions, dropping non-string entries", () => {
  assert.deepEqual(mapHashtagSuggestions({ hashtags: ["solid", 42, "fediverse", null] }), [
    "solid",
    "fediverse",
  ]);
  assert.deepEqual(mapHashtagSuggestions({}), []);
});

test("maps moderation suggestions, dropping entries missing a required field", () => {
  const result = mapModerationSuggestions({
    keywords: [{ keyword: "cryptoscam", reason: "matches existing pattern" }, { keyword: "" }],
    domains: [{ domain: "spam.example", reason: "matches a blocked domain" }],
    accounts: "not an array",
  });
  assert.deepEqual(result, {
    keywords: [{ keyword: "cryptoscam", reason: "matches existing pattern" }],
    domains: [{ domain: "spam.example", reason: "matches a blocked domain" }],
    accounts: [],
  });
});

test("maps filter matches, dropping entries missing an id", () => {
  assert.deepEqual(
    mapFilterMatches({
      matches: [
        { queryId: "f1:k1", documentId: "s1::0" },
        { queryId: "f1:k1" },
        {},
      ],
    }),
    [{ queryId: "f1:k1", documentId: "s1::0" }],
  );
});

test("maps a translation, defaulting to an empty string", () => {
  assert.equal(mapTranslation({ translated: "hola" }), "hola");
  assert.equal(mapTranslation({}), "");
});
