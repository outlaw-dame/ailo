import assert from "node:assert/strict";
import test from "node:test";

import {
  addressPostToCommunity,
  normalizeCommunityHandle,
  requireExactGroup,
} from "./fedipod-groups.js";

test("normalizes Lemmy, PieFed, and Mastodon-style Group handles", () => {
  assert.equal(normalizeCommunityHandle(" !Technology@LEMMY.WORLD "), "Technology@lemmy.world");
  assert.equal(normalizeCommunityHandle("@meta@piefed.social"), "meta@piefed.social");
});

test("rejects incomplete handles and URL-shaped input", () => {
  for (const value of ["technology", "!technology@", "https://lemmy.world/c/technology", "a@b@c"]) {
    assert.throws(() => normalizeCommunityHandle(value), /full community handle/);
  }
});

test("puts one canonical Group mention first", () => {
  assert.equal(
    addressPostToCommunity("A useful title\n\nHello @friend@example.net", "group@piefed.social"),
    "@group@piefed.social A useful title\n\nHello @friend@example.net",
  );
  assert.equal(
    addressPostToCommunity("Already @GROUP@PIEFED.SOCIAL addressed", "group@piefed.social"),
    "@group@piefed.social Already addressed",
  );
});

test("accepts only an exact ActivityPub Group match", () => {
  const group = { acct: "tech@lemmy.world", group: true, id: "group" };
  const person = { acct: "tech@example.social", group: false, id: "person" };
  assert.equal(requireExactGroup([person, group], "!TECH@lemmy.world"), group);
  assert.throws(
    () => requireExactGroup([person], "tech@example.social"),
    /not an ActivityPub community/,
  );
  assert.throws(() => requireExactGroup([group], "other@lemmy.world"), /Could not find/);
});
