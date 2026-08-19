import assert from "node:assert/strict";
import test from "node:test";

import {
  mapAiStatus,
  mapAssistantReply,
  mapFilterMatches,
  mapHashtagSuggestions,
  mapModerationSuggestions,
  mapProviderCredentials,
  mapSafeBrowsingResult,
  mapTranslation,
  mapTranslationSettings,
} from "./fedipod-ai.js";

test("maps provider credential state without accepting secret-shaped fields", () => {
  assert.deepEqual(mapProviderCredentials({
    openai: { configured: true, source: "local", api_key: "must-not-map" },
    gemini: { configured: true, source: "environment" },
    safe_browsing: { configured: false, source: "local" },
    klipy: { configured: true, source: "local" },
    deepl: { configured: true, source: "environment" },
  }), {
    openai: { configured: true, source: "local" },
    gemini: { configured: true, source: "environment" },
    safe_browsing: { configured: false, source: null },
    klipy: { configured: true, source: "local" },
    deepl: { configured: true, source: "environment" },
    libretranslate: { configured: false, source: null },
  });
});

test("maps translation settings without accepting unknown providers", () => {
  assert.deepEqual(mapTranslationSettings({
    provider: "deepl", libretranslate_url: "https://translate.example",
    auto_translate: true, target_language: "fr",
    configured_providers: ["deepl", "libretranslate", "unknown"],
  }), {
    provider: "deepl", libreTranslateUrl: "https://translate.example",
    autoTranslate: true, targetLanguage: "fr",
    configuredProviders: ["deepl", "libretranslate"],
  });
  assert.deepEqual(mapTranslationSettings({ provider: "unknown" }), {
    provider: null, libreTranslateUrl: "https://libretranslate.com",
    autoTranslate: false, targetLanguage: "en", configuredProviders: [],
  });
});

test("maps configured AI providers and Safe Browsing capability", () => {
  assert.deepEqual(mapAiStatus({
    enabled: true,
    providers: ["gemini", "openai", "unknown"],
    default_provider: "gemini",
    models: { gemini: "gemini-3.6-flash", openai: "gpt-4.1-mini" },
    safe_browsing: { enabled: true },
    klipy: { enabled: true },
    translation: { enabled: true, providers: ["deepl", "libretranslate"], default_provider: "deepl" },
  }), {
    enabled: true,
    providers: ["gemini", "openai"],
    defaultProvider: "gemini",
    models: { gemini: "gemini-3.6-flash", openai: "gpt-4.1-mini" },
    safeBrowsingEnabled: true,
    klipyEnabled: true,
    translationProviders: ["deepl", "libretranslate"],
    defaultTranslationProvider: "deepl",
  });
  assert.deepEqual(mapAiStatus({ enabled: true }), {
    enabled: true, providers: ["openai"], defaultProvider: "openai", models: {}, safeBrowsingEnabled: false, klipyEnabled: false,
    translationProviders: [], defaultTranslationProvider: null,
  });
  assert.deepEqual(mapAiStatus(null), {
    enabled: false, providers: [], defaultProvider: null, models: {}, safeBrowsingEnabled: false, klipyEnabled: false,
    translationProviders: [], defaultTranslationProvider: null,
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

test("maps an assistant reply, rejecting an unrecognized provider", () => {
  assert.deepEqual(mapAssistantReply({ reply: "hi there", provider: "gemini" }), {
    reply: "hi there", provider: "gemini",
  });
  assert.deepEqual(mapAssistantReply({ reply: "hi", provider: "claude" }), { reply: "hi", provider: null });
  assert.deepEqual(mapAssistantReply({}), { reply: "", provider: null });
});
