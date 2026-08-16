import assert from "node:assert/strict";
import test from "node:test";

import type { AiStatus } from "./types";
import { preferredAiProvider } from "./ai-provider.js";

test("selects a saved configured provider and safely falls back", () => {
  const status: AiStatus = {
    enabled: true, providers: ["openai", "gemini"],
    defaultProvider: "gemini", models: {}, safeBrowsingEnabled: false, klipyEnabled: false,
    translationProviders: [], defaultTranslationProvider: null,
  };
  assert.equal(preferredAiProvider(status, "openai"), "openai");
  assert.equal(preferredAiProvider(status, "unknown"), "gemini");
  assert.equal(preferredAiProvider({ ...status, enabled: false }, "gemini"), null);
});
