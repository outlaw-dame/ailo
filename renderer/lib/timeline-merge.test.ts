import test from "node:test";
import assert from "node:assert/strict";
import { mergeById } from "./timeline-merge.js";
import type { MastodonStatus } from "./types.js";

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

test("prepends genuinely new items and keeps existing ones in place", () => {
  const previous = [status("2"), status("1")];
  const fresh = [status("3"), status("2"), status("1")];

  const merged = mergeById(previous, fresh);

  assert.deepEqual(merged.map((s) => s.id), ["3", "2", "1"], "new item goes to the front, existing order is preserved");
});

test("does not drop an item just because it aged out of the latest page", () => {
  // A full-replace strategy would lose "1" here — it's not in the fresh
  // page anymore, but the reader may still be looking at it.
  const previous = [status("2"), status("1")];
  const fresh = [status("3"), status("2")];

  const merged = mergeById(previous, fresh);

  assert.deepEqual(merged.map((s) => s.id), ["3", "2", "1"]);
});

test("refreshes an existing item's data (counts, favourited, etc.) without moving it", () => {
  const previous = [status("1", { favouritesCount: 2, favourited: false })];
  const fresh = [status("1", { favouritesCount: 3, favourited: true })];

  const merged = mergeById(previous, fresh);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].favouritesCount, 3);
  assert.equal(merged[0].favourited, true);
});

test("returns the same object reference for an unchanged item (stable identity for React keying)", () => {
  const existing = status("1");
  const merged = mergeById([existing], [status("1")].map(() => existing));

  assert.equal(merged[0], existing);
});

test("caps the merged list at maxSize, trimming the oldest entries", () => {
  const previous = [status("old-1"), status("old-2")];
  const fresh = [status("new-1"), status("new-2")];

  const merged = mergeById(previous, fresh, 3);

  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((s) => s.id), ["new-1", "new-2", "old-1"], "oldest entry ('old-2') is trimmed");
});

test("works for non-status items with just an id (e.g. notifications)", () => {
  const previous = [{ id: "n1", read: false }];
  const fresh = [{ id: "n2", read: false }, { id: "n1", read: true }];

  const merged = mergeById(previous, fresh);

  assert.deepEqual(merged, [{ id: "n2", read: false }, { id: "n1", read: true }]);
});
