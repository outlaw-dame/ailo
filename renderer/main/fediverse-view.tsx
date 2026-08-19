import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AtSign, Bell, Compass, Hash, Home, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { NewPostsButton } from "../components/new-posts-button";
import { StatusCard } from "../components/status-card";
import { FediverseDiscover } from "../components/fediverse-discover";
import { FediverseTags } from "../components/fediverse-tags";
import { api } from "../lib/api";
import { adaptiveRefetchInterval, NEAR_TOP_THRESHOLD_PX } from "../lib/feed-refresh";
import { formatRelativeDate } from "../lib/markdown";
import { semanticFilterService } from "../lib/semantic-filter-service";
import { filterCustomFeed } from "../lib/custom-feed-match";
import { mergeById } from "../lib/timeline-merge";
import { usePendingReveal } from "../lib/use-pending-reveal";
import { useScrollMemory } from "../lib/use-scroll-memory";
import { useFediverseComposerState } from "../lib/use-fediverse-composer";

type Tab = "for-you" | "home" | "tag-feed" | "notifications" | "discover" | "tags";

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
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-secondary px-4 py-6 text-center">
      <Text color="secondary">{message}</Text>
      <Button size="small" variant="filled" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

export function FediverseView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Declared up front (before the queries below reference them) so each
  // query's refetchInterval can read live scroll position and pending-reveal
  // state without a circular dependency — usePendingReveal needs a query's
  // *data* to compute pendingCount, but the query's own refetchInterval
  // needs to know that same pendingCount. The refs are updated later, after
  // usePendingReveal runs; refetchInterval only reads them when the
  // scheduler actually fires, by which point they're current.
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const homePendingRef = React.useRef(0);
  const tagPendingRef = React.useRef(0);
  const forYouPendingRef = React.useRef(0);
  const nearTop = () => (viewportRef.current?.scrollTop ?? 0) < NEAR_TOP_THRESHOLD_PX;

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
    refetchInterval: 60_000,
  });
  const fedipodReady = connected && capabilitiesQuery.isSuccess;

  const timelineQuery = useQuery({
    queryKey: ["fedipod", "timeline"],
    queryFn: async () => {
      const [statuses, filters] = await Promise.all([
        api.fedipod.timeline(),
        api.fedipod.filters(),
      ]);
      const fresh = await semanticFilterService.apply(statuses, filters, "home");
      // Merge rather than replace: a fast-moving home timeline can easily
      // push more than a page's worth of new posts within one poll interval,
      // and swapping the array wholesale would tear down and recreate the
      // DOM node of a post the reader is mid-click on, silently eating the
      // click. See lib/timeline-merge.ts.
      const previous = queryClient.getQueryData<typeof fresh>(["fedipod", "timeline"]) ?? [];
      return mergeById(previous, fresh);
    },
    enabled: fedipodReady && tab === "home",
    // See lib/feed-refresh.ts — mirrors Phanpy: half-speed when not near the
    // top, paused entirely while there's a pending "new posts" batch. No
    // refetchOnWindowFocus override either; the global 30s staleTime default
    // already gates that gently instead of forcing a refetch on every
    // window-focus flicker.
    refetchInterval: (query) => adaptiveRefetchInterval(query.state.fetchFailureCount, homePendingRef.current, nearTop()),
  });
  const tagTimelineQuery = useQuery({
    queryKey: ["fedipod", "tag-timeline", selectedTag],
    queryFn: async () => {
      if (!selectedTag) return [];
      const [statuses, filters] = await Promise.all([
        api.fedipod.tagTimeline(selectedTag),
        api.fedipod.filters(),
      ]);
      const fresh = await semanticFilterService.apply(statuses, filters, "home");
      const previous = queryClient.getQueryData<typeof fresh>(["fedipod", "tag-timeline", selectedTag]) ?? [];
      return mergeById(previous, fresh);
    },
    enabled: fedipodReady && tab === "tag-feed" && Boolean(selectedTag),
    refetchInterval: (query) => adaptiveRefetchInterval(query.state.fetchFailureCount, tagPendingRef.current, nearTop()),
  });
  const notificationsQuery = useQuery({
    queryKey: ["fedipod", "notifications"],
    queryFn: async () => {
      const [notifications, filters] = await Promise.all([
        api.fedipod.notifications(),
        api.fedipod.filters(),
      ]);
      await semanticFilterService.apply(
        notifications.flatMap((n) => n.status ? [n.status] : []),
        filters,
        "notifications",
      );
      const previous = queryClient.getQueryData<typeof notifications>(["fedipod", "notifications"]) ?? [];
      return mergeById(previous, notifications);
    },
    enabled: fedipodReady && tab === "notifications",
    // Notifications aren't gated behind a pending-reveal banner, so there's
    // no "pause while pending" state to check — just the same near-top
    // backoff.
    refetchInterval: (query) => adaptiveRefetchInterval(query.state.fetchFailureCount, 0, nearTop()),
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
      const fresh = [...unique.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const previous = queryClient.getQueryData<typeof fresh>(["fedipod", "for-you"]) ?? [];
      return mergeById(previous, fresh);
    },
    enabled: fedipodReady && tab === "for-you" && aiStatusQuery.data?.enabled === true,
    refetchInterval: () => (forYouPendingRef.current > 0 ? false : (nearTop() ? 60_000 : 120_000)),
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

  // New posts merge in behind the scenes (see the timeline queries above),
  // but stay hidden behind a "N new posts" affordance unless the reader is
  // already at the top — otherwise a background refresh would insert content
  // above whatever they're currently reading and yank their scroll position
  // with it. Persisting scroll position per-tab (and, for Home specifically,
  // across restarts) is what "remain the spot of last read" needs on top of
  // that: switching tabs, navigating away, or quitting and relaunching all
  // leave the reader where they left off instead of snapping back to the top.
  const homeReveal = usePendingReveal(timelineQuery.data, viewportRef, "home");
  const tagReveal = usePendingReveal(tagTimelineQuery.data, viewportRef, selectedTag);
  const forYouReveal = usePendingReveal(forYouQuery.data, viewportRef, "for-you");
  React.useEffect(() => { homePendingRef.current = homeReveal.pendingCount; }, [homeReveal.pendingCount]);
  React.useEffect(() => { tagPendingRef.current = tagReveal.pendingCount; }, [tagReveal.pendingCount]);
  React.useEffect(() => { forYouPendingRef.current = forYouReveal.pendingCount; }, [forYouReveal.pendingCount]);
  const scrollKey = tab === "tag-feed" ? `tag:${selectedTag ?? ""}` : tab;
  const scrollReady =
    tab === "home" ? !timelineQuery.isLoading
    : tab === "tag-feed" ? !tagTimelineQuery.isLoading
    : tab === "notifications" ? !notificationsQuery.isLoading
    : tab === "for-you" ? !forYouQuery.isLoading
    : true;
  useScrollMemory(viewportRef, scrollKey, scrollReady, { persist: tab === "home" });

  if (!connected) {
    return (
      <ScrollArea
        title={t("fediverse.title")}
        subtitle={t("fediverse.subtitleDisconnected")}
        className="h-full"
      >
        <div className="relative flex min-h-[calc(100%-1px)] flex-col">
          <div className="knot-mesh-2 pointer-events-none absolute inset-x-6 top-4 h-56 rounded-card opacity-70" />
          <EmptyState
            title={t("fediverse.connectTitle")}
            description={t("fediverse.connectDescription")}
            actions={
              <Button variant="accent" onClick={() => void navigate({ to: "/profile" })}>
                <AtSign />
                {t("fediverse.connectAction")}
              </Button>
            }
          />
        </div>
      </ScrollArea>
    );
  }

  const account = statusQuery.data?.account;
  const timeline = homeReveal.visible;
  const tagTimeline = tagReveal.visible;
  const notifications = notificationsQuery.data ?? [];
  const capabilities = capabilitiesQuery.data;

  return (
    <div className="relative h-full">
      <ScrollArea
        ref={viewportRef}
        title={t("fediverse.title")}
        subtitle={account ? `@${account.acct || account.username}` : t("fediverse.subtitleConnected")}
        actions={
          <div className="flex items-center gap-1.5">
            <SegmentedControl
              size="small"
              value={tab === "tag-feed" ? "" : tab}
              onValueChange={(v) => {
                setSelectedTag(null);
                setTab(v as Tab);
              }}
              aria-label={t("fediverse.tabAriaLabel")}
            >
              {aiStatusQuery.data?.enabled ? (
                <SegmentedControlItem value="for-you">
                  <Sparkles />{t("fediverse.tabForYou")}
                </SegmentedControlItem>
              ) : null}
              <SegmentedControlItem value="home">
                <Home />
                {t("fediverse.tabHome")}
              </SegmentedControlItem>
              <SegmentedControlItem value="notifications">
                <Bell />
                {t("fediverse.tabAlerts")}
              </SegmentedControlItem>
              <SegmentedControlItem value="discover">
                <Compass />
                {t("fediverse.tabDiscover")}
              </SegmentedControlItem>
              <SegmentedControlItem value="tags">
                <Hash />
                {t("fediverse.tabTags")}
              </SegmentedControlItem>
            </SegmentedControl>
            <Button size="small" variant="filled" iconOnly aria-label={t("fediverse.refreshAriaLabel")} onClick={refresh}>
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
              <div className="rounded-card border border-secondary bg-control-subtle p-3">
                <Text variant="small-strong">{t("fediverse.forYouPrivacyTitle")}</Text>
                <Text variant="small" color="tertiary">
                  {aiStatusQuery.data?.defaultProvider === "gemini"
                    ? t("fediverse.forYouPrivacyGemini")
                    : t("fediverse.forYouPrivacyOpenAI")}
                </Text>
                <Button size="small" variant="transparent" className="mt-2" onClick={() => void navigate({ to: "/feeds" })}>
                  {t("fediverse.forYouTuneFeeds")}
                </Button>
              </div>
              {forYouQuery.isLoading ? (
                <FeedSkeleton />
              ) : forYouQuery.isError ? (
                <ErrorNote message={(forYouQuery.error as Error).message} onRetry={() => void forYouQuery.refetch()} />
              ) : forYouReveal.visible.length === 0 && forYouReveal.pendingCount === 0 ? (
                <Text color="tertiary" className="px-1 py-8 text-center">{t("fediverse.forYouEmpty")}</Text>
              ) : (
                <>
                  {forYouReveal.pendingCount > 0 ? (
                    <NewPostsButton count={forYouReveal.pendingCount} onClick={forYouReveal.reveal} />
                  ) : null}
                  {forYouReveal.visible.map((status) => (
                    <StatusCard key={status.id} status={status} ownAccountId={account?.id} onReply={openReply} onQuote={openQuote} onHashtag={openHashtag} />
                  ))}
                </>
              )}
            </div>
          ) : tab === "home" ? (
            timelineQuery.isLoading ? (
              <FeedSkeleton />
            ) : timelineQuery.isError ? (
              <ErrorNote message={(timelineQuery.error as Error).message} onRetry={refresh} />
            ) : timeline.length === 0 && homeReveal.pendingCount === 0 ? (
              <Text color="tertiary" className="px-1 py-8 text-center">
                {t("fediverse.homeEmpty")}
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {homeReveal.pendingCount > 0 ? (
                  <NewPostsButton count={homeReveal.pendingCount} onClick={homeReveal.reveal} />
                ) : null}
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
                  {t("common.back")}
                </Button>
                <Hash className="size-4" />
                <Text variant="strong">#{selectedTag}</Text>
              </div>
              {tagTimelineQuery.isLoading ? (
                <FeedSkeleton />
              ) : tagTimelineQuery.isError ? (
                <ErrorNote message={(tagTimelineQuery.error as Error).message} onRetry={refresh} />
              ) : tagTimeline.length === 0 && tagReveal.pendingCount === 0 ? (
                <Text color="tertiary" className="px-1 py-8 text-center">
                  {t("fediverse.tagFeedEmpty", { tag: selectedTag })}
                </Text>
              ) : (
                <>
                  {tagReveal.pendingCount > 0 ? (
                    <NewPostsButton count={tagReveal.pendingCount} onClick={tagReveal.reveal} />
                  ) : null}
                  {tagTimeline.map((s) => (
                    <StatusCard key={s.id} status={s} ownAccountId={account?.id} onReply={openReply} onQuote={openQuote} onHashtag={openHashtag} />
                  ))}
                </>
              )}
            </div>
          ) : tab === "notifications" ? (
            notificationsQuery.isLoading ? (
              <FeedSkeleton />
            ) : notificationsQuery.isError ? (
              <ErrorNote message={(notificationsQuery.error as Error).message} onRetry={refresh} />
            ) : notifications.length === 0 ? (
              <Text color="tertiary" className="px-1 py-8 text-center">
                {t("fediverse.notificationsEmpty")}
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
                          {t(`fediverse.notificationLabel.${n.type}`, { defaultValue: n.type })}
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
