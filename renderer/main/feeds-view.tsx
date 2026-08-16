import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, EmptyState, ScrollArea, toast } from "@glaze/core/components";

import { FediverseCustomFeeds } from "../components/fediverse-custom-feeds";
import { api } from "../lib/api";

export function FeedsView() {
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ["fedipod", "status"], queryFn: api.fedipod.status });
  const account = status.data?.account;
  if (!status.isLoading && !status.data?.connected) {
    return <ScrollArea title="Feeds" subtitle="Custom timelines you control" className="h-full">
      <div className="px-6 py-12"><EmptyState title="Reconnect FediPod" description="Your saved session is no longer accepted. Reconnect from You to open your feeds." actions={<Button variant="accent" onClick={() => void navigate({ to: "/profile" })}>Open You</Button>} /></div>
    </ScrollArea>;
  }
  const returnToFediverse = () => void navigate({ to: "/fediverse" });
  return <ScrollArea title="Feeds" subtitle="Custom feeds and people lists — For You stays in Fediverse" className="h-full">
    <div className="mx-auto max-w-6xl px-6 py-5">
      <FediverseCustomFeeds ownAccountId={account?.id} onReply={() => { toast.info("Opening Fediverse to reply"); returnToFediverse(); }} onQuote={() => { toast.info("Opening Fediverse to quote"); returnToFediverse(); }} onHashtag={returnToFediverse} />
    </div>
  </ScrollArea>;
}
