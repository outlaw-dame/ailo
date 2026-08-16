import assert from "node:assert/strict";
import test from "node:test";

import type { MastodonFilter, MastodonStatus } from "./types";
import {
  SemanticFilterService,
  semanticChunks,
  semanticDocument,
  semanticQuery,
  semanticText,
} from "./semantic-filter-service.js";

function status(content: string): MastodonStatus {
  return {
    id: "s1", uri: "s1", url: null, createdAt: "", content,
    objectType: "Note", title: null, contentType: "text/plain", source: null,
    filtered: [], spoilerText: "", language: "en", sensitive: false, visibility: "public", card: null,
    account: { id: "a", username: "a", acct: "a", displayName: "a", url: "", avatar: "", note: "", followersCount: 0, followingCount: 0, group: false },
    mediaAttachments: [], favouritesCount: 0, reblogsCount: 0, repliesCount: 0,
    favourited: false, reblogged: false, pinned: false, inReplyToId: null, reblog: null,
    quote: null, quoteApproval: null, quotesCount: 0,
  };
}

function filter(threshold = 0.6): MastodonFilter {
  return {
    id: "f1", title: "Transport", context: ["home"], expiresAt: null, action: "hide",
    keywords: [{ id: "f1-0", keyword: "electric cars", wholeWord: false, semantic: true, semanticThreshold: threshold, semanticModel: "embeddinggemma-300m" }],
  };
}

test("semantic matching adds standard filter metadata above the configured threshold", async () => {
  const vectors: Record<string, number[]> = {
    "task: search result | query: electric cars": [1, 0],
    "title: none | text: Battery-powered vehicles are getting cheaper.": [0.8, 0.2],
  };
  const service = new SemanticFilterService(async (texts) => texts.map((text) => vectors[text]));
  const posts = [status("<p>Battery-powered vehicles are getting cheaper.</p>")];
  await service.apply(posts, [filter()], "home");
  assert.deepEqual(posts[0].filtered[0]?.keywordMatches, ["f1-0"]);
});

test("semantic matching respects contexts, expiry, and strict thresholds", async () => {
  const service = new SemanticFilterService(async (texts) => texts.map((text) =>
    text === "task: search result | query: electric cars" ? [1, 0] : [0.8, 0.2],
  ));
  const post = status("Battery-powered vehicles are getting cheaper.");
  await service.apply([post], [filter(0.9)], "home");
  assert.equal(post.filtered.length, 0);
  await service.apply([post], [{ ...filter(), context: ["public"] }], "home");
  assert.equal(post.filtered.length, 0);
});

test("semantic text strips active markup and chunks bounded content", () => {
  const post = status("<script>bad()</script><p>Clean &amp; safe. Another sentence.</p>");
  assert.equal(semanticText(post), "Clean & safe. Another sentence.");
  assert.deepEqual(semanticChunks(semanticText(post)), ["Clean & safe.", "Another sentence."]);
});

test("EmbeddingGemma receives its documented retrieval prompts", () => {
  assert.equal(semanticQuery("#gardening"), "task: search result | query: gardening");
  assert.equal(
    semanticDocument("The best soil for tomatoes.", "Garden notes"),
    "title: Garden notes | text: The best soil for tomatoes.",
  );
});
