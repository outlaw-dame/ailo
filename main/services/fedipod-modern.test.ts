import assert from "node:assert/strict";
import test from "node:test";

import { mapCollection, mapCollectionImport, mapCollectionSourcePreview, mapQuoteMetadata } from "./fedipod-modern.js";

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

test("maps public Collection source preview, provenance, and import outcome", () => {
  const preview = mapCollectionSourcePreview({
    name: "Developers", description: "Opt-in pack", source_url: "https://fedidevs.com/s/abc/",
    source_page: "https://fedidevs.com/s/abc/", source_kind: "fedidevs", account_count: 12,
  });
  const imported = mapCollectionImport({
    source_url: preview.sourceUrl, account_count: 10, failed_count: 2, invitation_count: 10,
    added_count: 3, removed_count: 1,
    collections: [{
      id: "c2", name: "Developers", source_url: preview.sourceUrl,
      source_page: preview.sourcePage, source_kind: preview.sourceKind,
    }],
  });
  assert.equal(preview.accountCount, 12);
  assert.equal(imported.collections[0]?.sourceKind, "fedidevs");
  assert.equal(imported.failedCount, 2);
  assert.equal(imported.invitationCount, 10);
  assert.equal(imported.addedCount, 3);
  assert.equal(imported.removedCount, 1);
});
