import assert from "node:assert/strict";
import test from "node:test";

import {
  feedRefreshInterval,
  LIVE_REFRESH_INTERVAL_MS,
  MAX_REFRESH_BACKOFF_MS,
} from "./feed-refresh.js";

test("refreshes a healthy feed promptly and exponentially backs off failures", () => {
  assert.equal(feedRefreshInterval(0), LIVE_REFRESH_INTERVAL_MS);
  assert.equal(feedRefreshInterval(1), 30_000);
  assert.equal(feedRefreshInterval(2), 60_000);
  assert.equal(feedRefreshInterval(3), MAX_REFRESH_BACKOFF_MS);
  assert.equal(feedRefreshInterval(100), MAX_REFRESH_BACKOFF_MS);
});

test("normalizes invalid failure counters", () => {
  assert.equal(feedRefreshInterval(-1), LIVE_REFRESH_INTERVAL_MS);
  assert.equal(feedRefreshInterval(Number.NaN), LIVE_REFRESH_INTERVAL_MS);
});
