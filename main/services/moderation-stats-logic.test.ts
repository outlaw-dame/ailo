import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_AGE_MS,
  MAX_EVENTS,
  computeWeeklyStats,
  createDefaultState,
  validateState,
  withFilterHits,
  withModerationAction,
} from "./moderation-stats-logic.js";

const DAY = 24 * 60 * 60 * 1000;

test("withModerationAction records an event, computeWeeklyStats counts it by kind", () => {
  const now = Date.now();
  let state = createDefaultState();
  state = withModerationAction(state, "block", now);
  state = withModerationAction(state, "block", now);
  state = withModerationAction(state, "mute", now);
  const stats = computeWeeklyStats(state, 7, now);
  assert.equal(stats.newBlocks, 2);
  assert.equal(stats.newMutes, 1);
  assert.equal(stats.newDomainBlocks, 0);
});

test("computeWeeklyStats respects the requested window", () => {
  const now = Date.now();
  const state = {
    events: [
      { ts: now - 10 * DAY, kind: "block" as const },   // outside a 7-day window
      { ts: now - 2 * DAY, kind: "block" as const },     // inside
    ],
    seenFilterHits: {},
  };
  assert.equal(computeWeeklyStats(state, 7, now).newBlocks, 1);
  assert.equal(computeWeeklyStats(state, 30, now).newBlocks, 2);
});

test("withFilterHits records a new event per distinct key", () => {
  const now = Date.now();
  let state = createDefaultState();
  state = withFilterHits(state, ["s1::f1", "s2::f1", "s1::f1"], now);
  assert.equal(computeWeeklyStats(state, 7, now).filteredPosts, 2, "the duplicate key in one call is not double-counted");
});

test("computeWeeklyStats breaks filter hits down by filter, top 5, most first", () => {
  const now = Date.now();
  let state = createDefaultState();
  state = withFilterHits(state, ["s1::f1", "s2::f1", "s3::f1", "s4::f2"], now);
  assert.deepEqual(computeWeeklyStats(state, 7, now).byFilter, [
    { filterId: "f1", count: 3 },
    { filterId: "f2", count: 1 },
  ]);
});

test("withFilterHits does not recount the same post/filter pair within the dedupe window", () => {
  const now = Date.now();
  let state = createDefaultState();
  state = withFilterHits(state, ["s1::f1"], now);
  state = withFilterHits(state, ["s1::f1"], now + 60_000);   // same post still in view a minute later
  assert.equal(computeWeeklyStats(state, 7, now + 60_000).filteredPosts, 1);
});

test("withFilterHits counts the same post/filter pair again once the dedupe window has passed", () => {
  const now = Date.now();
  let state = createDefaultState();
  state = withFilterHits(state, ["s1::f1"], now);
  const laterTs = now + 21 * 60 * 60 * 1000;   // past the 20h dedupe window
  state = withFilterHits(state, ["s1::f1"], laterTs);
  assert.equal(computeWeeklyStats(state, 7, laterTs).filteredPosts, 2);
});

test("withModerationAction prunes events past MAX_AGE_MS", () => {
  const now = Date.now();
  let state = createDefaultState();
  state = withModerationAction(state, "block", now - MAX_AGE_MS - DAY);
  state = withModerationAction(state, "mute", now);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0]?.kind, "mute");
});

test("withModerationAction caps the event log at MAX_EVENTS", () => {
  const now = Date.now();
  const state = {
    events: Array.from({ length: MAX_EVENTS }, () => ({ ts: now, kind: "block" as const })),
    seenFilterHits: {},
  };
  const next = withModerationAction(state, "mute", now);
  assert.equal(next.events.length, MAX_EVENTS);
  assert.equal(next.events[next.events.length - 1]?.kind, "mute", "the newest event is kept, not dropped by the cap");
});

test("validateState tolerates garbage and keeps only well-shaped entries", () => {
  const state = validateState({
    events: [{ ts: 1, kind: "block" }, { ts: "nope", kind: "block" }, null, "junk"],
    seenFilterHits: { "s1::f1": 5, "s2::f2": "nope" },
  });
  assert.equal(state.events.length, 1);
  assert.deepEqual(state.seenFilterHits, { "s1::f1": 5 });
});

test("validateState falls back cleanly for non-object input", () => {
  assert.deepEqual(validateState(null), createDefaultState());
  assert.deepEqual(validateState("garbage"), createDefaultState());
});
