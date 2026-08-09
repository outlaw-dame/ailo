import assert from "node:assert/strict";
import test from "node:test";

import { mapCollection, mapQuoteMetadata } from "./fedipod-modern.js";

const account = {
  id: "a1", username: "ada", acct: "ada@example.social", display_name: "Ada",
  url: "https://example.social/@ada", avatar: "https://example.social/a.png",
};

test("maps quote-post metadata with one caller-bounded nested status", () => {
  const status = mapQuoteMetadata({
    id: "s2", uri: "https://example.social/s2", account, pinned: true, quotes_count: 3,
    quote_approval: { automatic: ["public"], manual: [], current_user: "automatic" },
    quote: {
      state: "accepted",
      quoted_status: { id: "s1", uri: "https://example.social/s1", account, content: "<p>source</p>" },
    },
  }, (raw) => raw && typeof raw === "object" ? raw as never : null);
  assert.equal(status.quotesCount, 3);
  assert.equal(status.quote?.state, "accepted");
  assert.equal((status.quote?.quotedStatus as unknown as { id: string })?.id, "s1");
  assert.equal(status.quoteApproval?.currentUser, "automatic");
});

test("maps Mastodon 4.6 Collection envelopes and consent state", () => {
  const collection = mapCollection({ collection: {
    id: "c1", account_id: "a1", uri: "https://pod.example/c1", url: "https://pod.example/#c1",
    name: "Writers", description: "Worth reading", discoverable: true, item_count: 1,
    items: [{ id: "i1", account_id: "a2", state: "pending", created_at: "2026-08-09T00:00:00Z" }],
    created_at: "2026-08-09T00:00:00Z", updated_at: "2026-08-09T00:00:00Z",
  } });
  assert.equal(collection.name, "Writers");
  assert.equal(collection.discoverable, true);
  assert.equal(collection.items[0]?.state, "pending");
});
