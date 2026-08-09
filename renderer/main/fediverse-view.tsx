import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AtSign, Bell, Home, RefreshCw } from "lucide-react";
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
import { api } from "../lib/api";
import { formatRelativeDate } from "../lib/markdown";
import type { MastodonStatus } from "../lib/types";

type Tab = "home" | "notifications";

const NOTIFICATION_LABEL: Record<string, string> = {
  mention: "mentioned you",
  reblog: "boosted your story",
  favourite: "favourited your story",
  follow: "followed you",
  follow_request: "requested to follow you",
  poll: "ran a poll that ended",
  status: "posted",
  update: "edited a post",
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

  const [tab, setTab] = React.useState<Tab>("home");
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<MastodonStatus | null>(null);

  const timelineQuery = useQuery({
    queryKey: ["fedipod", "timeline"],
    queryFn: () => api.fedipod.timeline(),
    enabled: connected,
  });
  const notificationsQuery = useQuery({
    queryKey: ["fedipod", "notifications"],
    queryFn: () => api.fedipod.notifications(),
    enabled: connected,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["fedipod", tab === "home" ? "timeline" : "notifications"],
    });
  };

  const openCompose = () => {
    setReplyTo(null);
    setComposerOpen(true);
  };
  const openReply = (status: MastodonStatus) => {
    setReplyTo(status);
    setComposerOpen(true);
  };
  const handleComposerOpenChange = (next: boolean) => {
    setComposerOpen(next);
    if (!next) setReplyTo(null);
  };

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
  const notifications = notificationsQuery.data ?? [];

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
              value={tab}
              onValueChange={(v) => setTab(v as Tab)}
              aria-label="Fediverse tab"
            >
              <SegmentedControlItem value="home">
                <Home />
                Home
              </SegmentedControlItem>
              <SegmentedControlItem value="notifications">
                <Bell />
                Alerts
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
          {tab === "home" ? (
            timelineQuery.isLoading ? (
              <FeedSkeleton />
            ) : timelineQuery.isError ? (
              <ErrorNote message={(timelineQuery.error as Error).message} onRetry={refresh} />
            ) : timeline.length === 0 ? (
              <Text color="tertiary" className="px-1 py-8 text-center">
                Your home timeline is quiet. Follow people to see their posts here.
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {timeline.map((s) => (
                  <StatusCard key={s.id} status={s} onReply={openReply} />
                ))}
              </div>
            )
          ) : notificationsQuery.isLoading ? (
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
                  {n.status ? <StatusCard status={n.status} onReply={openReply} /> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      <FloatingComposeButton visible={feedIdle} onClick={openCompose} />
      <FediverseComposer
        open={composerOpen}
        onOpenChange={handleComposerOpenChange}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
