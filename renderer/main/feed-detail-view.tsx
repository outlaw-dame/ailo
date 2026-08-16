import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Settings, Trash2, WandSparkles } from "lucide-react";
import { Button, ScrollArea, Text, toast, ToolbarBackButton } from "@glaze/core/components";

import { StatusCard } from "../components/status-card";
import { api } from "../lib/api";
import { filterCustomFeed } from "../lib/custom-feed-match";
import { semanticFilterService } from "../lib/semantic-filter-service";

/**
 * A single feed's own page — banner, avatar, name, description, then its
 * live matching posts below. The Bluesky/Surf.social-style "open a feed"
 * view; creating/editing the feed's rules happens on Settings → Feeds.
 */
export function FeedDetailView() {
  const { feedId } = useParams({ from: "/feeds/$feedId" });
  const navigate = useNavigate();
  const returnToFediverse = () => void navigate({ to: "/fediverse" });
  const status = useQuery({ queryKey: ["fedipod", "status"], queryFn: api.fedipod.status });

  const feedQuery = useQuery({
    queryKey: ["fedipod", "custom-feed", feedId],
    queryFn: () => api.fedipod.customFeed(feedId),
  });
  const feed = feedQuery.data;

  const timeline = useQuery({
    queryKey: ["fedipod", "custom-feed-timeline", feedId, feed?.updatedAt],
    queryFn: async () => {
      const candidates = await api.fedipod.customFeedTimeline(feedId);
      let semantic = new Set<string>();
      if (feed!.semanticKeywords.length) {
        try { semantic = await semanticFilterService.matchPhrases(candidates, feed!.semanticKeywords); }
        catch (error) { console.warn("[custom-feed] semantic matching unavailable; exact rules remain active", error); }
      }
      return filterCustomFeed(candidates, feed!, semantic);
    },
    enabled: Boolean(feed),
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });

  const drop = useMutation({
    mutationFn: () => api.fedipod.deleteCustomFeed(feedId),
    onSuccess: () => { toast.success("Custom feed deleted"); void navigate({ to: "/feeds" }); },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ScrollArea
      title={feed ? "" : feedQuery.isLoading ? "Loading…" : "Feed"}
      leading={<ToolbarBackButton onClick={() => void navigate({ to: "/feeds" })} />}
      actions={feed ? (
        <div className="flex items-center gap-1.5">
          <Button size="small" variant="transparent" onClick={() => void api.app.openSettings()}>
            <Settings />Manage
          </Button>
          <Button size="small" variant="transparent" disabled={drop.isPending}
            onClick={() => { if (window.confirm(`Delete "${feed.name}"? This cannot be undone.`)) drop.mutate(); }}>
            <Trash2 />
          </Button>
        </div>
      ) : null}
      className="h-full"
    >
      {feedQuery.isLoading ? (
        <div className="flex flex-col gap-4 px-6 pt-2">
          <div className="h-28 w-full animate-pulse rounded-card bg-control-subtle" />
          <div className="h-6 w-1/3 max-w-xs animate-pulse rounded-control bg-control-subtle" />
        </div>
      ) : !feed ? (
        <div className="px-8 py-10">
          <Text color="secondary">This feed could not be found.</Text>
        </div>
      ) : (
        <div className="pb-16">
          <header className="mx-6 mt-2 overflow-hidden rounded-card border border-secondary bg-control-subtle">
            <div className="h-32 bg-control sm:h-40">
              {feed.bannerUrl ? <img src={feed.bannerUrl} alt="" className="size-full object-cover" /> : null}
            </div>
            <div className="flex flex-col px-5 pb-5">
              <div className="-mt-9 mb-2 size-18 overflow-hidden rounded-full border-4 border-primary bg-control">
                {feed.avatarUrl ? <img src={feed.avatarUrl} alt="" className="size-full object-cover" />
                  : <div className="flex size-full items-center justify-center"><WandSparkles /></div>}
              </div>
              <Text as="h1" variant="heading1">{feed.name}</Text>
              {feed.description ? <Text color="secondary" className="mt-1">{feed.description}</Text> : null}
            </div>
          </header>
          <section className="mx-6 mt-6 flex flex-col gap-3">
            {timeline.isLoading ? (
              <Text color="tertiary">Matching posts…</Text>
            ) : timeline.data?.length ? (
              timeline.data.map((item) => (
                <StatusCard key={item.id} status={item} ownAccountId={status.data?.account?.id} onHashtag={returnToFediverse}
                  onReply={() => { toast.info("Opening Fediverse to reply"); returnToFediverse(); }}
                  onQuote={() => { toast.info("Opening Fediverse to quote"); returnToFediverse(); }} />
              ))
            ) : (
              <Text color="tertiary">No matching public posts have reached FediPod yet.</Text>
            )}
          </section>
        </div>
      )}
    </ScrollArea>
  );
}
