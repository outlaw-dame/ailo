import assert from "node:assert/strict";
import test from "node:test";

import { mapCreatorAttribution, mapCreatorCard } from "./fedipod-creator.js";

const account = {
  id: "a1", username: "ada", acct: "ada@social.example", display_name: "Ada",
  url: "https://social.example/@ada", avatar: "https://social.example/ada.png",
};

test("maps allowed creator domains and produces the exact fediverse:creator tag", () => {
  const creator = mapCreatorAttribution({
    ...account,
    source: { attribution_domains: ["writers.example", "news.example", 42] },
  }, () => ({
    id: "a1", username: "ada", acct: "ada@social.example", displayName: "Ada",
    url: account.url, avatar: account.avatar, note: "", followersCount: 0, followingCount: 0, group: false,
  }));
  assert.deepEqual(creator.domains, ["writers.example", "news.example"]);
  assert.equal(
    creator.tag,
    '<meta name="fediverse:creator" content="@ada@social.example">',
  );
});

test("maps verified PreviewCard authors and missing-attribution state", () => {
  const card = mapCreatorCard({
    url: "https://writers.example/story", title: "Story", description: "A report",
    provider_name: "Writers", provider_url: "https://writers.example",
    missing_attribution: true,
    authors: [{ name: "Ada", url: account.url, account }],
  }, () => ({
    id: "a1", username: "ada", acct: "ada@social.example", displayName: "Ada",
    url: account.url, avatar: account.avatar, note: "", followersCount: 0, followingCount: 0, group: false,
  }));
  assert.equal(card?.providerName, "Writers");
  assert.equal(card?.authors[0]?.account?.acct, "ada@social.example");
  assert.equal(card?.missingAttribution, true);
});
