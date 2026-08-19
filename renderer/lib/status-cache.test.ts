import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { patchStatusInCaches } from "./status-cache.js";
import type { MastodonNotification, MastodonStatus } from "./types.js";

const status = (id: string, overrides: Partial<MastodonStatus> = {}): MastodonStatus => ({
  id, uri: id, url: null, createdAt: "", content: "hello", objectType: "Note", title: null,
  contentType: "text/plain", source: null, filtered: [], spoilerText: "", language: "en",
  sensitive: false, visibility: "public", account: { id: "a", username: "a", acct: "a@example.com",
    displayName: "a", url: "", avatar: "", note: "", followersCount: 0, followingCount: 0, group: false },
  mediaAttachments: [], card: null, favouritesCount: 0, reblogsCount: 0, repliesCount: 0,
  quotesCount: 0,
  favourited: false, reblogged: false, pinned: false, bookmarked: false, inReplyToId: null, reblog: null,
  quote: null, quoteApproval: null,
  ...overrides,
});

test("patches a status wherever it's cached, across differently-keyed queries", () => {
  const client = new QueryClient();
  client.setQueryData(["fedipod", "timeline"], [status("1"), status("2")]);
  client.setQueryData(["fedipod", "custom-feed-timeline", "feed-a"], [status("1")]);
  client.setQueryData(["fedipod", "tag-timeline", "hiking"], [status("2")]);
  // A key this module never names on purpose — the whole point is not
  // needing to enumerate every list a status can be sitting in.
  client.setQueryData(["fedipod", "search", "hiking"], [status("1")]);
  // Unrelated cached data under the same prefix must survive untouched.
  client.setQueryData(["fedipod", "status"], { connected: true });

  patchStatusInCaches(client, "1", { favourited: true, favouritesCount: 4 });

  assert.equal((client.getQueryData(["fedipod", "timeline"]) as MastodonStatus[])[0].favourited, true);
  assert.equal((client.getQueryData(["fedipod", "timeline"]) as MastodonStatus[])[0].favouritesCount, 4);
  assert.equal((client.getQueryData(["fedipod", "timeline"]) as MastodonStatus[])[1].favourited, false, "a different status in the same list is untouched");
  assert.equal((client.getQueryData(["fedipod", "custom-feed-timeline", "feed-a"]) as MastodonStatus[])[0].favourited, true);
  assert.equal((client.getQueryData(["fedipod", "tag-timeline", "hiking"]) as MastodonStatus[])[0].favourited, false, "status \"2\" was not patched");
  assert.equal((client.getQueryData(["fedipod", "search", "hiking"]) as MastodonStatus[])[0].favourited, true);
  assert.deepEqual(client.getQueryData(["fedipod", "status"]), { connected: true });
});

test("patches a boost's inner reblogged status, not the wrapper", () => {
  const client = new QueryClient();
  const original = status("orig", { reblogged: false, reblogsCount: 2 });
  const wrapper = status("boost-wrapper", { reblog: original });
  client.setQueryData(["fedipod", "timeline"], [wrapper]);

  patchStatusInCaches(client, "orig", { reblogged: true, reblogsCount: 3 });

  const [patched] = client.getQueryData(["fedipod", "timeline"]) as MastodonStatus[];
  assert.equal(patched.id, "boost-wrapper", "the wrapper itself is untouched");
  assert.equal(patched.reblog?.reblogged, true);
  assert.equal(patched.reblog?.reblogsCount, 3);
});

test("patches a status inside a notification's .status field", () => {
  const client = new QueryClient();
  const notification: MastodonNotification = {
    id: "n1", type: "favourite", createdAt: "", account: status("a").account,
    status: status("1"), collection: null,
  };
  client.setQueryData(["fedipod", "notifications"], [notification]);

  patchStatusInCaches(client, "1", { favourited: true });

  const [patched] = client.getQueryData(["fedipod", "notifications"]) as MastodonNotification[];
  assert.equal(patched.status?.favourited, true);
});
