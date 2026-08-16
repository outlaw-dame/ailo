import assert from "node:assert/strict";
import test from "node:test";

import { hashtagFromLink, normalizeLinkedHashtag } from "./hashtag-links.js";

test("extracts normalized hashtags from Mastodon and Ailo links", () => {
  assert.equal(hashtagFromLink({ href: "https://social.example/tags/F%C3%A9diverse" }), "fédiverse");
  assert.equal(hashtagFromLink({ dataHashtag: "#SolidProject" }), "solidproject");
});

test("does not intercept ordinary, malformed, or numeric-only links", () => {
  assert.equal(hashtagFromLink({ href: "https://social.example/@ada/123" }), null);
  assert.equal(hashtagFromLink({ href: "javascript:alert(1)" }), null);
  assert.equal(normalizeLinkedHashtag("1234"), null);
});
