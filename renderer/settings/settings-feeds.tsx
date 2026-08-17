import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Text, toast } from "@glaze/core/components";

import { CustomFeedEditor } from "../components/custom-feed-editor";
import { api } from "../lib/api";

/** Create and edit custom feeds. Viewing a feed's live posts happens on the main Feeds page. */
export function FeedsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const feeds = useQuery({ queryKey: ["fedipod", "custom-feeds"], queryFn: api.fedipod.customFeeds });
  React.useEffect(() => {
    if (!creating && !selectedId && feeds.data?.[0]) setSelectedId(feeds.data[0].id);
  }, [creating, feeds.data, selectedId]);
  const selected = feeds.data?.find((feed) => feed.id === selectedId) ?? null;
  const drop = useMutation({
    mutationFn: api.fedipod.deleteCustomFeed,
    onSuccess: async () => {
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "custom-feeds"] });
      toast.success(t("feedsSettings.deleteSuccess"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
    <div className="flex flex-col gap-2">
      <Button variant="filled" className="justify-start" onClick={() => { setCreating(true); setSelectedId(null); }}>
        <Plus />{t("feedsSettings.newFeed")}
      </Button>
      {feeds.data?.map((feed) => <button key={feed.id} type="button"
        className={`flex min-w-0 items-center gap-3 rounded-card border p-2 text-left transition-colors ${!creating && feed.id === selectedId ? "border-accent bg-control-subtle" : "border-transparent hover:bg-control-subtle"}`}
        onClick={() => { setCreating(false); setSelectedId(feed.id); }}>
        {feed.avatarUrl ? <img src={feed.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          : <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-control-subtle"><WandSparkles className="size-4" /></div>}
        <span className="flex min-w-0 flex-col">
          <Text variant="small-strong" truncate>{feed.name}</Text>
          {feed.description ? <Text variant="mini" color="tertiary" truncate>{feed.description}</Text> : null}
        </span>
      </button>)}
      {!feeds.isLoading && !feeds.data?.length ? <Text variant="mini" color="tertiary" className="px-2">
        {t("feedsSettings.noFeeds")}
      </Text> : null}
    </div>
    <div className="min-w-0">
      {!creating && !selected && !feeds.isLoading ? (
        <Text color="tertiary">{t("feedsSettings.selectOrCreate")}</Text>
      ) : (
        <div className="flex flex-col gap-4">
          <CustomFeedEditor initial={creating ? null : selected} onSaved={(feed) => { setCreating(false); setSelectedId(feed.id); }} />
          {selected && !creating ? <Button size="small" variant="transparent" className="self-start"
            disabled={drop.isPending}
            onClick={() => { if (window.confirm(t("feedsSettings.deleteConfirm", { name: selected.name }))) drop.mutate(selected.id); }}>
            <Trash2 />{t("feedsSettings.deleteFeed")}
          </Button> : null}
        </div>
      )}
    </div>
  </div>;
}
