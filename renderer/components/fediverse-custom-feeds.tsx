import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { List, Plus, Trash2, UserPlus, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Input, SegmentedControl, SegmentedControlItem, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import type { MastodonStatus } from "../lib/types";
import { StatusCard } from "./status-card";

function PeopleLists({ ownAccountId, onReply, onQuote, onHashtag }: {
  ownAccountId?: string; onReply: (status: MastodonStatus) => void;
  onQuote: (status: MastodonStatus) => void; onHashtag: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [handle, setHandle] = React.useState("");
  const lists = useQuery({ queryKey: ["fedipod", "lists"], queryFn: api.fedipod.lists });
  React.useEffect(() => {
    if (!selectedId && lists.data?.[0]) setSelectedId(lists.data[0].id);
  }, [lists.data, selectedId]);
  const accounts = useQuery({
    queryKey: ["fedipod", "list-accounts", selectedId],
    queryFn: () => api.fedipod.listAccounts(selectedId!), enabled: Boolean(selectedId),
  });
  const timeline = useQuery({
    queryKey: ["fedipod", "list-timeline", selectedId],
    queryFn: () => api.fedipod.listTimeline(selectedId!), enabled: Boolean(selectedId),
    refetchInterval: 30_000, refetchOnWindowFocus: "always",
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fedipod", "lists"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "list-accounts", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "list-timeline", selectedId] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () => api.fedipod.createList(title),
    onSuccess: async (list) => { setTitle(""); setSelectedId(list.id); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const add = useMutation({
    mutationFn: () => api.fedipod.setListAccount(selectedId!, handle, true),
    onSuccess: async () => { setHandle(""); await refresh(); toast.success(t("customFeeds.listAddWithoutFollowing")); },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (account: { id: string; acct: string }) => api.fedipod.setListAccount(selectedId!, account.acct, false),
    onSuccess: refresh, onError: (error: Error) => toast.error(error.message),
  });
  const drop = useMutation({
    mutationFn: api.fedipod.deleteList,
    onSuccess: async () => { setSelectedId(null); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const selected = lists.data?.find((list) => list.id === selectedId);
  return (
    <div className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("customFeeds.listNewPlaceholder")} maxLength={80} /><Button iconOnly aria-label={t("customFeeds.listCreateAriaLabel")} disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}><Plus /></Button></div>
        {lists.data?.map((list) => <Button key={list.id} variant={list.id === selectedId ? "filled" : "transparent"} className="justify-start" onClick={() => setSelectedId(list.id)}><List />{list.title}</Button>)}
      </div>
      {selected ? <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2"><Text variant="strong" className="flex-1">{selected.title}</Text><Button iconOnly variant="transparent" aria-label={t("customFeeds.listDeleteAriaLabel", { title: selected.title })} onClick={() => drop.mutate(selected.id)}><Trash2 /></Button></div>
        <Text variant="small" color="tertiary">{t("customFeeds.listNote")}</Text>
        <div className="flex gap-2"><Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t("customFeeds.listHandlePlaceholder")} /><Button disabled={!handle.trim() || add.isPending} onClick={() => add.mutate()}><UserPlus />{t("customFeeds.listAddButton")}</Button></div>
        {accounts.data?.map((account) => <div key={account.id} className="flex items-center gap-3 rounded-control border border-secondary p-2"><img alt="" src={account.avatar} className="size-8 rounded-full" /><div className="flex min-w-0 flex-1 flex-col"><Text variant="small" truncate>{account.displayName}</Text><Text variant="mini" color="tertiary" truncate>@{account.acct}</Text></div><Button size="small" variant="transparent" onClick={() => remove.mutate(account)}>{t("common.remove")}</Button></div>)}
        <div className="mt-2 flex flex-col gap-3 border-t border-secondary pt-4">
          <Text variant="strong">{t("customFeeds.listFeedTitle")}</Text>
          {timeline.data?.length ? timeline.data.map((status) => <StatusCard key={status.id} status={status} ownAccountId={ownAccountId} onReply={onReply} onQuote={onQuote} onHashtag={onHashtag} />) : <Text color="tertiary">{t("customFeeds.listEmpty")}</Text>}
        </div>
      </div> : <Text color="tertiary">{t("customFeeds.listNone")}</Text>}
    </div>
  );
}

/**
 * Feeds you're subscribed to/created. Selecting one opens its own page
 * (banner, avatar, name, description, then its live posts) — creating and
 * editing rules happens on Settings → Feeds instead.
 */
export function FediverseCustomFeeds({ ownAccountId, onReply, onQuote, onHashtag }: {
  ownAccountId?: string; onReply: (status: MastodonStatus) => void;
  onQuote: (status: MastodonStatus) => void; onHashtag: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = React.useState("feeds");
  const feeds = useQuery({ queryKey: ["fedipod", "custom-feeds"], queryFn: api.fedipod.customFeeds });
  return <div className="flex flex-col gap-5">
    <SegmentedControl size="small" value={mode} onValueChange={setMode} aria-label={t("customFeeds.feedToolsAriaLabel")}>
      <SegmentedControlItem value="feeds"><WandSparkles />{t("customFeeds.tabCustomFeeds")}</SegmentedControlItem>
      <SegmentedControlItem value="lists"><List />{t("customFeeds.tabPeopleLists")}</SegmentedControlItem>
    </SegmentedControl>
    {mode === "lists" ? <PeopleLists ownAccountId={ownAccountId} onReply={onReply} onQuote={onQuote} onHashtag={onHashtag} /> : <div className="flex flex-col gap-2">
      <Button variant="filled" className="justify-start self-start" onClick={() => void api.app.openSettings()}>
        <Plus />{t("customFeeds.newFeed")}
      </Button>
      {feeds.data?.map((feed) => <button key={feed.id} type="button"
        className="flex min-w-0 items-center gap-3 rounded-card border border-transparent p-2 text-left transition-colors hover:bg-control-subtle"
        onClick={() => void navigate({ to: "/feeds/$feedId", params: { feedId: feed.id } })}>
        {feed.avatarUrl ? <img src={feed.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          : <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-control-subtle"><WandSparkles className="size-4" /></div>}
        <span className="flex min-w-0 flex-col">
          <Text variant="small-strong" truncate>{feed.name}</Text>
          {feed.description ? <Text variant="mini" color="tertiary" truncate>{feed.description}</Text> : null}
        </span>
      </button>)}
      {!feeds.isLoading && !feeds.data?.length ? <Text color="tertiary" className="px-2 py-1">
        {t("customFeeds.noFeeds")}
      </Text> : null}
    </div>}
  </div>;
}
