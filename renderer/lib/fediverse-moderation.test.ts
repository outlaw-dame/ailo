import assert from "node:assert/strict";
import test from "node:test";

import { moderationFor } from "./fediverse-moderation.js";
import type { MastodonFilterResult } from "./types.js";

function result(id: string, action: "warn" | "hide" | "blur"): MastodonFilterResult {
  return {
    filter: { id, title: id, context: ["home"], expiresAt: null, action, keywords: [] },
    keywordMatches: [`${id}-0`],
  };
}

test("hide filters suppress a status while warn and blur remain revealable", () => {
  const moderation = moderationFor([result("warning", "warn"), result("hidden", "hide")]);
  assert.equal(moderation.hidden, true);
  assert.deepEqual(moderation.warnings.map((entry) => entry.filter.id), ["warning"]);
});

test("warn-only filters preserve the status behind a warning", () => {
  const moderation = moderationFor([result("warning", "warn")]);
  assert.equal(moderation.hidden, false);
  assert.equal(moderation.warnings.length, 1);
});
