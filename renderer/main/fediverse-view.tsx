import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AtSign, Bell, Home, RefreshCw, Send, Users, X } from "lucide-react";
import {
  Button,
  EmptyState,
  Input,
  Label,
  ScrollArea,
  SegmentedControl,
  SegmentedControlItem,
  Switch,
  Text,
  Textarea,
  toast,
} from "@glaze/core/components";

import { StatusCard } from "../components/status-card";
import { api } from "../lib/api";
import { formatRelativeDate } from "../lib/markdown";
import type { FediverseVisibility, MastodonStatus } from "../lib/types";

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
  const [text, setText] = React.useState("");
  const [cwEnabled, setCwEnabled] = React.useState(false);
  const [cw, setCw] = React.useState("");
  const [visibility, setVisibility] = React.useState<FediverseVisibility>("public");
  const [replyTo, setReplyTo] = React.useState<MastodonStatus | null>(null);
  const [community, setCommunity] = React.useState("");

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

  const post = useMutation({
    mutationFn: () =>
      api.fedipod.post({
        status: text.trim(),
        spoilerText: cwEnabled ? cw.trim() || "Sensitive content" : null,
        visibility,
        inReplyToId: replyTo?.id ?? null,
        community: replyTo ? null : community.trim() || null,
      }),
    onSuccess: async () => {
      setText("");
      setCw("");
      setCwEnabled(false);
      setReplyTo(null);
      setCommunity("");
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "timeline"] });
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "notifications"] });
      toast.success("Posted to the Fediverse");
    },
    onError: (e: Error) => toast.error(e.message || "Could not post"),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["fedipod", tab === "home" ? "timeline" : "notifications"],
    });
  };

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
    <ScrollArea
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
        <div className="flex flex-col gap-3 rounded-card border border-secondary bg-well/40 px-4 py-3.5">
          {replyTo ? (
            <div className="flex items-center gap-2">
              <Text variant="small" color="tertiary" truncate className="min-w-0 flex-1">
                Replying to @{replyTo.account.acct || replyTo.account.username}
              </Text>
              <Button
                size="small"
                variant="transparent"
                iconOnly
                aria-label="Cancel reply"
                onClick={() => setReplyTo(null)}
              >
                <X />
              </Button>
            </div>
          ) : null}
          {cwEnabled ? (
            <Input
              value={cw}
              onChange={(e) => setCw(e.target.value)}
              placeholder="Content warning"
            />
          ) : null}
          {!replyTo ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Users className="size-4 shrink-0 text-tertiary" />
                <Input
                  value={community}
                  onChange={(event) => {
                    setCommunity(event.target.value);
                    if (event.target.value.trim()) setVisibility("public");
                  }}
                  placeholder="Optional community, e.g. !technology@lemmy.world"
                  aria-label="Community handle"
                />
              </div>
              {community.trim() ? (
                <Text variant="mini" color="tertiary" className="pl-6">
                  The first line becomes the Lemmy/PieFed title. Ailo verifies this is a Group and
                  sends the post publicly.
                </Text>
              ) : null}
            </div>
          ) : null}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={replyTo ? "Write your reply…" : "Share something with the Fediverse…"}
            size="large"
          />
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="small"
              value={visibility}
              onValueChange={(v) => setVisibility(v as FediverseVisibility)}
              aria-label="Visibility"
            >
              <SegmentedControlItem value="public">Public</SegmentedControlItem>
              <SegmentedControlItem value="unlisted" disabled={Boolean(community.trim())}>
                Unlisted
              </SegmentedControlItem>
              <SegmentedControlItem value="private" disabled={Boolean(community.trim())}>
                Followers
              </SegmentedControlItem>
            </SegmentedControl>
            <Label className="ml-1 gap-2">
              <Switch
                checked={cwEnabled}
                onCheckedChange={setCwEnabled}
                aria-label="Content warning"
              />
              CW
            </Label>
            <Button
              size="small"
              variant="accent"
              className="ml-auto"
              disabled={post.isPending || !text.trim()}
              onClick={() => post.mutate()}
            >
              <Send />
              {replyTo ? "Reply" : community.trim() ? "Post to community" : "Post"}
            </Button>
          </div>
        </div>

        {tab === "home" ? (
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
                <StatusCard key={s.id} status={s} onReply={setReplyTo} />
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
                {n.status ? <StatusCard status={n.status} onReply={setReplyTo} /> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
