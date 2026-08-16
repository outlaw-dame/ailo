import assert from "node:assert/strict";
import test from "node:test";
import { renderHook, act } from "@testing-library/react";

import { useFediverseComposerState } from "./use-fediverse-composer.js";
import type { MastodonStatus } from "./types.js";

function status(id: string): MastodonStatus {
  return {
    id, uri: id, url: null, createdAt: "", content: "hi", objectType: "Note", title: null,
    contentType: "text/plain", source: null, filtered: [], spoilerText: "", language: "en",
    sensitive: false, visibility: "public",
    account: { id: "a", username: "a", acct: "a", displayName: "a", url: "", avatar: "", note: "", followersCount: 0, followingCount: 0, group: false },
    mediaAttachments: [], card: null, favouritesCount: 0, reblogsCount: 0, repliesCount: 0, quotesCount: 0,
    favourited: false, reblogged: false, pinned: false, inReplyToId: null, reblog: null, quote: null, quoteApproval: null,
  };
}

test("starts closed, with no reply/quote target", () => {
  const { result } = renderHook(() => useFediverseComposerState());
  assert.equal(result.current.composerOpen, false);
  assert.equal(result.current.replyTo, null);
  assert.equal(result.current.quoteTarget, null);
});

test("openReply sets replyTo, opens the composer, and clears any quote target", () => {
  const { result } = renderHook(() => useFediverseComposerState());
  act(() => result.current.openQuote(status("q1")));
  assert.equal(result.current.quoteTarget?.id, "q1");

  act(() => result.current.openReply(status("r1")));
  assert.equal(result.current.composerOpen, true);
  assert.equal(result.current.replyTo?.id, "r1");
  assert.equal(result.current.quoteTarget, null, "opening a reply clears any quote target — only one can be active");
});

test("openQuote sets quoteTarget, opens the composer, and clears any reply target", () => {
  const { result } = renderHook(() => useFediverseComposerState());
  act(() => result.current.openReply(status("r1")));
  act(() => result.current.openQuote(status("q1")));
  assert.equal(result.current.composerOpen, true);
  assert.equal(result.current.quoteTarget?.id, "q1");
  assert.equal(result.current.replyTo, null);
});

test("openCompose opens a plain composer with no reply/quote target", () => {
  const { result } = renderHook(() => useFediverseComposerState());
  act(() => result.current.openReply(status("r1")));
  act(() => result.current.openCompose());
  assert.equal(result.current.composerOpen, true);
  assert.equal(result.current.replyTo, null);
  assert.equal(result.current.quoteTarget, null);
});

test("closing via onOpenChange(false) clears both targets; onOpenChange(true) does not touch them", () => {
  const { result } = renderHook(() => useFediverseComposerState());
  act(() => result.current.openReply(status("r1")));
  act(() => result.current.onOpenChange(false));
  assert.equal(result.current.composerOpen, false);
  assert.equal(result.current.replyTo, null);
});

test("onCancelReply/onCancelQuote clear their target without closing the composer", () => {
  const { result } = renderHook(() => useFediverseComposerState());
  act(() => result.current.openReply(status("r1")));
  act(() => result.current.onCancelReply());
  assert.equal(result.current.replyTo, null);
  assert.equal(result.current.composerOpen, true, "cancelling the reply target alone leaves the composer open");
});
