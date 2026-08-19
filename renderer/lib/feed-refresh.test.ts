import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptiveRefetchInterval,
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

test("adaptiveRefetchInterval pauses entirely once a new-posts batch is pending", () => {
  assert.equal(adaptiveRefetchInterval(0, 1, true), false);
  assert.equal(adaptiveRefetchInterval(0, 5, false), false);
});

test("adaptiveRefetchInterval polls at half speed away from the top", () => {
  assert.equal(adaptiveRefetchInterval(0, 0, true), LIVE_REFRESH_INTERVAL_MS);
  assert.equal(adaptiveRefetchInterval(0, 0, false), LIVE_REFRESH_INTERVAL_MS * 2);
});

test("adaptiveRefetchInterval still backs off on failures on top of the near-top multiplier", () => {
  assert.equal(adaptiveRefetchInterval(1, 0, true), 30_000);
  assert.equal(adaptiveRefetchInterval(1, 0, false), 60_000);
});
