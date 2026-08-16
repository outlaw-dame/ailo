import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, EmptyState, ScrollArea } from "@glaze/core/components";

import { FediverseComposer } from "../components/fediverse-composer";
import { FediverseCustomFeeds } from "../components/fediverse-custom-feeds";
import { api } from "../lib/api";
import { useFediverseComposerState } from "../lib/use-fediverse-composer";

export function FeedsView() {
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ["fedipod", "status"], queryFn: api.fedipod.status });
  const capabilitiesQuery = useQuery({ queryKey: ["fedipod", "capabilities"], queryFn: () => api.fedipod.capabilities() });
  const composer = useFediverseComposerState();
  const account = status.data?.account;
  if (!status.isLoading && !status.data?.connected) {
    return <ScrollArea title="Feeds" subtitle="Custom timelines you control" className="h-full">
      <div className="px-6 py-12"><EmptyState title="Reconnect FediPod" description="Your saved session is no longer accepted. Reconnect from You to open your feeds." actions={<Button variant="accent" onClick={() => void navigate({ to: "/profile" })}>Open You</Button>} /></div>
    </ScrollArea>;
  }
  const returnToFediverse = () => void navigate({ to: "/fediverse" });
  return <ScrollArea title="Feeds" subtitle="Custom feeds and people lists — For You stays in Fediverse" className="h-full">
    <div className="mx-auto max-w-6xl px-6 py-5">
      <FediverseCustomFeeds ownAccountId={account?.id} onReply={composer.openReply} onQuote={composer.openQuote} onHashtag={returnToFediverse} />
    </div>
    <FediverseComposer
      open={composer.composerOpen}
      onOpenChange={composer.onOpenChange}
      replyTo={composer.replyTo}
      onCancelReply={composer.onCancelReply}
      quoteTarget={composer.quoteTarget}
      onCancelQuote={composer.onCancelQuote}
      capabilities={capabilitiesQuery.data}
    />
  </ScrollArea>;
}
