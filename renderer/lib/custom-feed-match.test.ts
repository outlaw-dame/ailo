import test from "node:test";
import assert from "node:assert/strict";
import { exactCustomFeedMatch, filterCustomFeed } from "./custom-feed-match.js";
import type { CustomFeed, MastodonStatus } from "./types.js";

const feed: CustomFeed = {
  id: "f", name: "Climate", description: "", avatarUrl: null, bannerUrl: null,
  accounts: ["alice@example.com"], hashtags: ["climate"],
  semanticKeywords: ["renewable energy transition"], excludeWords: ["spoiler"],
  excludeAccounts: ["bot@example.net"], createdAt: "", updatedAt: "",
};
const status = (acct: string, content: string, id = acct): MastodonStatus => ({
  id, uri: id, url: null, createdAt: "", content, objectType: "Note", title: null,
  contentType: "text/plain", source: null, filtered: [], spoilerText: "", language: "en",
  sensitive: false, visibility: "public", account: { id: acct, username: acct.split("@")[0], acct,
    displayName: acct, url: "", avatar: "", note: "", followersCount: 0, followingCount: 0, group: false },
  mediaAttachments: [], card: null, favouritesCount: 0, reblogsCount: 0, repliesCount: 0,
  quotesCount: 0,
  favourited: false, reblogged: false, pinned: false, bookmarked: false, inReplyToId: null, reblog: null,
  quote: null, quoteApproval: null,
});

test("custom feeds match accounts, bounded hashtags, and whole phrases", () => {
  assert.equal(exactCustomFeedMatch(status("alice@example.com", "hello"), feed), true);
  assert.equal(exactCustomFeedMatch(status("x@example.com", "<p>#climate news</p>"), feed), true);
  assert.equal(exactCustomFeedMatch(status("x@example.com", "renewable energy transition"), feed), true);
  assert.equal(exactCustomFeedMatch(status("x@example.com", "#climates"), feed), false);
});

test("exclusions win over inclusive and semantic matches", () => {
  const excluded = status("alice@example.com", "spoiler climate", "excluded");
  const semantic = status("bot@example.net", "clean", "semantic");
  assert.deepEqual(filterCustomFeed([excluded, semantic], feed, new Set(["excluded", "semantic"])), []);
});

test("account rules match and exclude regardless of the case either side used", () => {
  const mixedCaseFeed: CustomFeed = {
    ...feed, accounts: ["Alice@Example.Com"], excludeAccounts: ["Bot@Example.Net"],
  };
  assert.equal(exactCustomFeedMatch(status("alice@example.com", "hi"), mixedCaseFeed), true);
  const excluded = status("bot@example.net", "hi", "excluded");
  assert.deepEqual(filterCustomFeed([excluded], mixedCaseFeed, new Set()), []);
});
