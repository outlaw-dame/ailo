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

function keywordFilter(keyword: string, overrides: Partial<MastodonFilter["keywords"][number]> = {}): MastodonFilter {
  return {
    id: "f1", title: keyword, context: ["home"], expiresAt: null, action: "hide",
    keywords: [{ id: "f1-0", keyword, wholeWord: false, semantic: true, semanticThreshold: 0.6, semanticModel: "embeddinggemma-300m", ...overrides }],
  };
}

// Orthogonal, fixed vectors: any local-model call in these tests (still
// made even when a literal match already resolved a filter — see apply()'s
// own structure) can never itself produce a match, so every assertion below
// is really only exercising literalMatch(), not this fake embedder.
const nonMatchingEmbedder = async (texts: string[]) => texts.map((text) => (text.startsWith("task:") ? [1, 0] : [0, 1]));

// A keyword saved with "#nsfw" (typed with the hash) must match a post that
// says "nsfw" in plain text and one that hashtags it, and a keyword saved
// as plain "nsfw" must match a hashtag post too — literal matching is what
// actually guarantees this, independent of any embedding score.
test("a literal keyword matches, regardless of hashtag vs. plain text on either side", async () => {
  const service = new SemanticFilterService(nonMatchingEmbedder);
  const hashtagKeyword = keywordFilter("#nsfw");
  const plainKeyword = keywordFilter("nsfw");

  const plainPost = status("hey just a heads up this post has NSFW content in it");
  await service.apply([plainPost], [hashtagKeyword], "home");
  assert.deepEqual(plainPost.filtered[0]?.keywordMatches, ["f1-0"], "\"#nsfw\" keyword matches plain-text \"nsfw\", case-insensitively");

  const hashtagPost = status("check out my new art #nsfw #adultcontent");
  await service.apply([hashtagPost], [plainKeyword], "home");
  assert.deepEqual(hashtagPost.filtered[0]?.keywordMatches, ["f1-0"], "plain \"nsfw\" keyword matches a #nsfw hashtag");
});

test("literal matching honors whole-word, unlike a bare substring check", async () => {
  const service = new SemanticFilterService(nonMatchingEmbedder);
  const wholeWordFilter = keywordFilter("cat", { wholeWord: true, semantic: false });
  const substringPost = status("I got a new catalog in the mail");
  const wholeWordPost = status("my cat knocked a plant off the shelf");
  await service.apply([substringPost], [wholeWordFilter], "home");
  assert.equal(substringPost.filtered.length, 0, "\"catalog\" does not satisfy a whole-word \"cat\" filter");
  await service.apply([wholeWordPost], [wholeWordFilter], "home");
  assert.deepEqual(wholeWordPost.filtered[0]?.keywordMatches, ["f1-0"]);
});

test("a keyword saved semantic:false still matches literally — it used to match nothing at all", async () => {
  const service = new SemanticFilterService(nonMatchingEmbedder);
  const filter = keywordFilter("spoilers", { semantic: false });
  const post = status("huge spoilers for the finale below");
  await service.apply([post], [filter], "home");
  assert.deepEqual(post.filtered[0]?.keywordMatches, ["f1-0"]);
});

test("literal matching does not fabricate a match for unrelated text", async () => {
  const service = new SemanticFilterService(nonMatchingEmbedder);
  const post = status("just finished my morning coffee and a walk in the park");
  await service.apply([post], [keywordFilter("nsfw")], "home");
  assert.equal(post.filtered.length, 0);
});
