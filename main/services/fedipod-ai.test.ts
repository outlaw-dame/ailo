import assert from "node:assert/strict";
import test from "node:test";

import {
  mapAiStatus,
  mapFilterMatches,
  mapHashtagSuggestions,
  mapModerationSuggestions,
  mapSafeBrowsingResult,
  mapTranslation,
} from "./fedipod-ai.js";

test("maps configured AI providers and Safe Browsing capability", () => {
  assert.deepEqual(mapAiStatus({
    enabled: true,
    providers: ["gemini", "openai", "unknown"],
    default_provider: "gemini",
    models: { gemini: "gemini-3.6-flash", openai: "gpt-4.1-mini" },
    safe_browsing: { enabled: true },
  }), {
    enabled: true,
    providers: ["gemini", "openai"],
    defaultProvider: "gemini",
    models: { gemini: "gemini-3.6-flash", openai: "gpt-4.1-mini" },
    safeBrowsingEnabled: true,
  });
  assert.deepEqual(mapAiStatus({ enabled: true }), {
    enabled: true, providers: ["openai"], defaultProvider: "openai", models: {}, safeBrowsingEnabled: false,
  });
  assert.deepEqual(mapAiStatus(null), {
    enabled: false, providers: [], defaultProvider: null, models: {}, safeBrowsingEnabled: false,
  });
});

test("maps Google Safe Browsing threats without trusting malformed entries", () => {
  assert.deepEqual(mapSafeBrowsingResult({
    safe: false, cached: true, checked_urls: ["https://example.test", 4],
    threats: [{ url: "https://bad.test", threatTypes: ["MALWARE", 2] }, null],
  }), {
    safe: false, cached: true, checkedUrls: ["https://example.test"],
    threats: [{ url: "https://bad.test", threatTypes: ["MALWARE"] }],
  });
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
