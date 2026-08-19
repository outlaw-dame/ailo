import assert from "node:assert/strict";
import test from "node:test";

import { mapFeaturedTag, mapTag, normalizeHashtag } from "./fedipod-tags.js";

test("normalizes valid Unicode hashtags and rejects numeric-only or punctuated input", () => {
  assert.equal(normalizeHashtag(" #Fédiverse "), "fédiverse");
  assert.equal(normalizeHashtag("1234"), null);
  assert.equal(normalizeHashtag("bad/tag"), null);
});

test("maps Mastodon followed-tag state and seven-day history without coercing counters", () => {
  const tag = mapTag({
    id: "fediverse", name: "fediverse", url: "https://pod.example/tags/fediverse",
    following: true, featured: false,
    history: [{ day: "1786233600", uses: "12", accounts: "7" }],
  });
  assert.equal(tag.following, true);
  assert.equal(tag.featured, false);
  assert.deepEqual(tag.history[0], { day: "1786233600", uses: "12", accounts: "7" });
});

test("maps featured-tag profile metadata and safely defaults malformed counts", () => {
  assert.deepEqual(mapFeaturedTag({
    id: "abc", name: "writing", url: "https://pod.example/#writing",
    statuses_count: "4", last_status_at: "2026-08-09",
  }), {
    id: "abc", name: "writing", url: "https://pod.example/#writing",
    statusesCount: 4, lastStatusAt: "2026-08-09",
  });
  assert.equal(mapFeaturedTag({ statuses_count: "not-a-number" }).statusesCount, 0);
});
