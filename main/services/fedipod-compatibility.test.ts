import assert from "node:assert/strict";
import test from "node:test";

import { parseFediPodCompatibility } from "./fedipod-compatibility.js";

const compatible = {
  configuration: {
    ailo: {
      api_version: 1,
      min_ailo_api_version: 1,
      fedipod_version: "0.5.0",
      features: ["tag_timeline", "streaming", "public_feed", "media_upload", "klipy_gif_search", "translation_providers", "translation_preferences", "open_media_formats", "custom_feeds", "account_lists", "domain_blocks", "ai_feeds"],
    },
  },
};

test("accepts an explicit compatible FediPod runtime contract", () => {
  assert.deepEqual(parseFediPodCompatibility(compatible), {
    apiVersion: 1,
    minAiloApiVersion: 1,
    fedipodVersion: "0.5.0",
    features: ["tag_timeline", "streaming", "public_feed", "media_upload", "klipy_gif_search", "translation_providers", "translation_preferences", "open_media_formats", "custom_feeds", "account_lists", "domain_blocks", "ai_feeds"],
  });
});

test("rejects stale, newer-incompatible, and incomplete FediPod runtimes", () => {
  assert.throws(() => parseFediPodCompatibility({}), /too old to prove/i);
  assert.throws(() => parseFediPodCompatibility({
    configuration: { ailo: { ...compatible.configuration.ailo, api_version: 2 } },
  }), /Ailo build is too old/i);
  assert.throws(() => parseFediPodCompatibility({
    configuration: { ailo: { ...compatible.configuration.ailo, features: [] } },
  }), /missing required features/i);
});
