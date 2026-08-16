import * as React from "react";

import type { MastodonStatus } from "./types";

export interface FediverseComposerState {
  composerOpen: boolean;
  replyTo: MastodonStatus | null;
  quoteTarget: MastodonStatus | null;
  openCompose: () => void;
  openReply: (status: MastodonStatus) => void;
  openQuote: (status: MastodonStatus) => void;
  onOpenChange: (open: boolean) => void;
  onCancelReply: () => void;
  onCancelQuote: () => void;
}

/**
 * Shared open/reply/quote state for <FediverseComposer/> — every view that
 * renders a StatusCard (Fediverse home, a custom feed's own page, the Feeds
 * list) uses this so Reply and Quote open the composer in place, right
 * there, instead of only working on the Fediverse tab.
 */
export function useFediverseComposerState(): FediverseComposerState {
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<MastodonStatus | null>(null);
  const [quoteTarget, setQuoteTarget] = React.useState<MastodonStatus | null>(null);

  const openCompose = React.useCallback(() => {
    setReplyTo(null);
    setQuoteTarget(null);
    setComposerOpen(true);
  }, []);
  const openReply = React.useCallback((status: MastodonStatus) => {
    setQuoteTarget(null);
    setReplyTo(status);
    setComposerOpen(true);
  }, []);
  const openQuote = React.useCallback((status: MastodonStatus) => {
    setReplyTo(null);
    setQuoteTarget(status);
    setComposerOpen(true);
  }, []);
  const onOpenChange = React.useCallback((next: boolean) => {
    setComposerOpen(next);
    if (!next) {
      setReplyTo(null);
      setQuoteTarget(null);
    }
  }, []);
  const onCancelReply = React.useCallback(() => setReplyTo(null), []);
  const onCancelQuote = React.useCallback(() => setQuoteTarget(null), []);

  return {
    composerOpen, replyTo, quoteTarget,
    openCompose, openReply, openQuote, onOpenChange, onCancelReply, onCancelQuote,
  };
}
