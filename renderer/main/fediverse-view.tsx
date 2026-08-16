import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AtSign, Bell, Compass, Hash, Home, RefreshCw, Sparkles } from "lucide-react";
import {
  Button,
  EmptyState,
  ScrollArea,
  SegmentedControl,
  SegmentedControlItem,
  Text,
} from "@glaze/core/components";

import { FediverseComposer } from "../components/fediverse-composer";
import { FloatingComposeButton } from "../components/floating-compose-button";
import { StatusCard } from "../components/status-card";
import { FediverseDiscover } from "../components/fediverse-discover";
import { FediverseTags } from "../components/fediverse-tags";
import { api } from "../lib/api";
import { feedRefreshInterval } from "../lib/feed-refresh";
import { formatRelativeDate } from "../lib/markdown";
import { semanticFilterService } from "../lib/semantic-filter-service";
import { filterCustomFeed } from "../lib/custom-feed-match";
import { useFediverseComposerState } from "../lib/use-fediverse-composer";

type Tab = "for-you" | "home" | "tag-feed" | "notifications" | "discover" | "tags";

const NOTIFICATION_LABEL: Record<string, string> = {
  mention: "mentioned you",
  reblog: "boosted your story",
  favourite: "favourited your story",
  follow: "followed you",
  follow_request: "requested to follow you",
  poll: "ran a poll that ended",
  status: "posted",
  update: "edited a post",
  quote: "quoted your post",
  quoted_update: "updated a quote of your post",
  added_to_collection: "added you to a collection",
  collection_update: "updated a collection featuring you",
};

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 w-full animate-pulse rounded-card bg-control-subtle" />
      ))}
    </div>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-secondary px-4 py-6 text-center">
      <Text color="secondary">{message}</Text>
      <Button size="small" variant="filled" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function FediverseView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["fedipod", "status"],
    queryFn: () => api.fedipod.status(),
  });
  const connected = Boolean(statusQuery.data?.connected);
  const aiStatusQuery = useQuery({ queryKey: ["fedipod", "ai-status"], queryFn: api.ai.status, enabled: connected });

  const [tab, setTab] = React.useState<Tab>("home");
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null);
  const {
    composerOpen, replyTo, quoteTarget, openCompose, openReply, openQuote,
    onOpenChange: handleComposerOpenChange, onCancelReply, onCancelQuote,
  } = useFediverseComposerState();

  const capabilitiesQuery = useQuery({
    queryKey: ["fedipod", "capabilities"],
    queryFn: () => api.fedipod.capabilities(),
    enabled: connected,
    // Re-prove the running daemon's contract instead of trusting a successful
    // check forever; this catches an old process or rollback while Ailo stays
    // open and pauses dependent feeds until compatibility is restored.
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
  });
  const fedipodReady = connected && capabilitiesQuery.isSuccess;

  const timelineQuery = useQuery({
    queryKey: ["fedipod", "timeline"],
    queryFn: async () => {
      const [statuses, filters] = await Promise.all([
        api.fedipod.timeline(),
        api.fedipod.filters(),
      ]);
      return semanticFilterService.apply(statuses, filters, "home");
    },
    enabled: fedipodReady && tab === "home",
    refetchInterval: (query) => feedRefreshInterval(query.state.fetchFailureCount),
    refetchOnWindowFocus: "always",
  });
  const tagTimelineQuery = useQuery({
    queryKey: ["fedipod", "tag-timeline", selectedTag],
    queryFn: async () => {
      if (!selectedTag) return [];
      const [statuses, filters] = await Promise.all([
        api.fedipod.tagTimeline(selectedTag),
        api.fedipod.filters(),
      ]);
      return semanticFilterService.apply(statuses, filters, "home");
    },
    enabled: fedipodReady && tab === "tag-feed" && Boolean(selectedTag),
    refetchInterval: (query) => feedRefreshInterval(query.state.fetchFailureCount),
    refetchOnWindowFocus: "always",
  });
  const notificationsQuery = useQuery({
    queryKey: ["fedipod", "notifications"],
    queryFn: async () => {
      const [notifications, filters] = await Promise.all([
        api.fedipod.notifications(),
        api.fedipod.filters(),
      ]);
      await semanticFilterService.apply(
        notifications.flatMap((notification) => notification.status ? [notification.status] : []),
        filters,
        "notifications",
      );
      return notifications;
    },
    enabled: fedipodReady && tab === "notifications",
    refetchInterval: (query) => feedRefreshInterval(query.state.fetchFailureCount),
    refetchOnWindowFocus: "always",
  });
  const forYouQuery = useQuery({
    queryKey: ["fedipod", "for-you"],
    queryFn: async () => {
      const feeds = await api.fedipod.customFeeds();
      const batches = await Promise.all(feeds.map(async (feed) => {
        const candidates = await api.fedipod.customFeedTimeline(feed.id);
        let semantic = new Set<string>();
        if (feed.semanticKeywords.length) semantic = await semanticFilterService.matchPhrases(candidates, feed.semanticKeywords);
        return filterCustomFeed(candidates, feed, semantic);
      }));
      const unique = new Map(batches.flat().map((status) => [status.id, status]));
      return [...unique.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    enabled: fedipodReady && tab === "for-you" && aiStatusQuery.data?.enabled === true,
    refetchInterval: 60_000, refetchOnWindowFocus: "always",
  });

  const refresh = () => {
    if (tab === "for-you") { void forYouQuery.refetch(); return; }
    if (tab === "tags") {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fedipod", "followed-tags"] }),
        queryClient.invalidateQueries({ queryKey: ["fedipod", "featured-tags"] }),
        queryClient.invalidateQueries({ queryKey: ["fedipod", "featured-tag-suggestions"] }),
      ]);
      return;
    }
    if (tab === "discover") {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fedipod", "suggestions"] }),
        queryClient.invalidateQueries({ queryKey: ["fedipod", "collections"] }),
      ]);
      return;
    }
    if (tab === "tag-feed") {
      void queryClient.invalidateQueries({ queryKey: ["fedipod", "tag-timeline", selectedTag] });
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: ["fedipod", tab === "home" ? "timeline" : "notifications"],
    });
  };

  const openHashtag = React.useCallback((tag: string) => {
    setSelectedTag(tag);
    setTab("tag-feed");
  }, []);

  // Hide the floating compose button while the feed is actively scrolling and
  // bring it back once scrolling settles.
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [feedIdle, setFeedIdle] = React.useState(true);

  React.useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const handleScroll = () => {
      setFeedIdle(false);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setFeedIdle(true), 500);
    };
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", handleScroll);
      if (timeout) clearTimeout(timeout);
    };
  }, [connected]);

  if (!connected) {
    return (
      <ScrollArea
        title="Fediverse"
        subtitle="Share knowledge across the open social web"
        className="h-full"
      >
        <div className="relative flex min-h-[calc(100%-1px)] flex-col">
          <div className="knot-mesh-2 pointer-events-none absolute inset-x-6 top-4 h-56 rounded-card opacity-70" />
          <EmptyState
            title="Connect your FediPod"
            description="FediPod is your personal ActivityPub agent backed by a Solid Pod. Connect it in the You tab to read your home timeline and share stories across Mastodon and the wider Fediverse."
            actions={
              <Button variant="accent" onClick={() => void navigate({ to: "/profile" })}>
                <AtSign />
                Connect in You
              </Button>
            }
          />
        </div>
      </ScrollArea>
    );
  }

  const account = statusQuery.data?.account;
  const timeline = timelineQuery.data ?? [];
  const tagTimeline = tagTimelineQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const capabilities = capabilitiesQuery.data;

  return (
    <div className="relative h-full">
      <ScrollArea
        ref={viewportRef}
        title="Fediverse"
        subtitle={account ? `@${account.acct || account.username}` : "Your home timeline"}
        actions={
          <div className="flex items-center gap-1.5">
            <SegmentedControl
              size="small"
              value={tab === "tag-feed" ? "" : tab}
              onValueChange={(v) => {
                setSelectedTag(null);
                setTab(v as Tab);
              }}
              aria-label="Fediverse tab"
            >
              {aiStatusQuery.data?.enabled ? <SegmentedControlItem value="for-you"><Sparkles />For You</SegmentedControlItem> : null}
              <SegmentedControlItem value="home">
                <Home />
                Home
              </SegmentedControlItem>
              <SegmentedControlItem value="notifications">
                <Bell />
                Alerts
              </SegmentedControlItem>
              <SegmentedControlItem value="discover">
                <Compass />
                Discover
              </SegmentedControlItem>
              <SegmentedControlItem value="tags">
                <Hash />
                Tags
              </SegmentedControlItem>
            </SegmentedControl>
            <Button size="small" variant="filled" iconOnly aria-label="Refresh" onClick={refresh}>
              <RefreshCw />
            </Button>
          </div>
        }
        className="h-full"
      >
        <div className="flex max-w-2xl flex-col gap-5 px-6 py-4">
          {capabilitiesQuery.isLoading ? (
            <FeedSkeleton />
          ) : capabilitiesQuery.isError ? (
            <ErrorNote
              message={(capabilitiesQuery.error as Error).message}
              onRetry={() => void capabilitiesQuery.refetch()}
            />
          ) : tab === "for-you" ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-card border border-secondary bg-control-subtle p-3"><Text variant="small-strong">Private personalization</Text><Text variant="small" color="tertiary">Built from your custom-feed rules and matched on this device. Fediverse post text is not sent to {aiStatusQuery.data?.defaultProvider === "gemini" ? "Gemini" : "OpenAI"}.</Text><Button size="small" variant="transparent" className="mt-2" onClick={() => void navigate({ to: "/feeds" })}>Tune feeds</Button></div>
              {forYouQuery.isLoading ? <FeedSkeleton /> : forYouQuery.isError ? <ErrorNote message={(forYouQuery.error as Error).message} onRetry={() => void forYouQuery.refetch()} /> : forYouQuery.data?.length ? forYouQuery.data.map((status) => <StatusCard key={status.id} status={status} ownAccountId={account?.id} onReply={openReply} onQuote={openQuote} onHashtag={openHashtag} />) : <Text color="tertiary" className="px-1 py-8 text-center">Create a custom feed to teach For You what belongs here.</Text>}
            </div>
          ) : tab === "home" ? (
            timelineQuery.isLoading ? (
              <FeedSkeleton />
            ) : timelineQuery.isError ? (
              <ErrorNote message={(timelineQuery.error as Error).message} onRetry={refresh} />
            ) : timeline.length === 0 ? (
              <Text color="tertiary" className="px-1 py-8 text-center">
                Your home timeline is quiet. Follow people or join communities to see posts here.
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {timeline.map((s) => (
                  <StatusCard key={s.id} status={s} ownAccountId={account?.id} onReply={openReply} onQuote={openQuote} onHashtag={openHashtag} />
                ))}
              </div>
            )
          ) : tab === "tag-feed" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1">
                <Button size="small" variant="transparent" onClick={() => {
                  setSelectedTag(null);
                  setTab("home");
                }}>
                  Back
                </Button>
                <Hash className="size-4" />
                <Text variant="strong">#{selectedTag}</Text>
              </div>
              {tagTimelineQuery.isLoading ? (
                <FeedSkeleton />
              ) : tagTimelineQuery.isError ? (
                <ErrorNote message={(tagTimelineQuery.error as Error).message} onRetry={refresh} />
              ) : tagTimeline.length === 0 ? (
                <Text color="tertiary" className="px-1 py-8 text-center">
                  No posts for #{selectedTag} have reached this FediPod yet.
                </Text>
              ) : (
                tagTimeline.map((s) => (
                  <StatusCard key={s.id} status={s} ownAccountId={account?.id} onReply={openReply} onQuote={openQuote} onHashtag={openHashtag} />
                ))
              )}
            </div>
          ) : tab === "notifications" ? (
            notificationsQuery.isLoading ? (
              <FeedSkeleton />
            ) : notificationsQuery.isError ? (
              <ErrorNote message={(notificationsQuery.error as Error).message} onRetry={refresh} />
            ) : notifications.length === 0 ? (
              <Text color="tertiary" className="px-1 py-8 text-center">
                No notifications yet.
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {notifications.map((n) => (
                  <div key={n.id} className="flex flex-col gap-2">
                    <div className="flex min-w-0 items-center gap-2 px-1">
                      <img
                        src={n.account.avatar}
                        alt=""
                        className="size-6 shrink-0 rounded-full bg-control-subtle object-cover"
                      />
                      <Text variant="small" truncate className="min-w-0 flex-1">
                        <Text as="span" variant="small-strong">
                          {n.account.displayName}
                        </Text>{" "}
                        <Text as="span" color="tertiary">
                          {NOTIFICATION_LABEL[n.type] ?? n.type}
                        </Text>
                      </Text>
                      <Text variant="mini" color="quaternary" className="shrink-0 tabular-nums">
                        {formatRelativeDate(n.createdAt)}
                      </Text>
                    </div>
                    {n.status ? (
                      <StatusCard status={n.status} ownAccountId={account?.id} onReply={openReply} onQuote={openQuote} onHashtag={openHashtag} />
                    ) : null}
                    {n.collection ? (
                      <div className="rounded-card border border-secondary bg-control-subtle px-3 py-2">
                        <Text variant="small-strong">{n.collection.name}</Text>
                        {n.collection.description ? (
                          <Text variant="small" color="secondary">{n.collection.description}</Text>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : tab === "tags" ? (
            <FediverseTags />
          ) : (
            <FediverseDiscover />
          )}
        </div>
      </ScrollArea>
      <FloatingComposeButton visible={feedIdle} onClick={openCompose} />
      <FediverseComposer
        open={composerOpen}
        onOpenChange={handleComposerOpenChange}
        replyTo={replyTo}
        onCancelReply={onCancelReply}
        quoteTarget={quoteTarget}
        onCancelQuote={onCancelQuote}
        capabilities={capabilities}
      />
    </div>
  );
}
