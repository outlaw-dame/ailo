import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@glaze/core/components";

import { FediverseComposer } from "../components/fediverse-composer";
import { StatusCard } from "../components/status-card";
import { api } from "../lib/api";
import { mergeById } from "../lib/timeline-merge";
import { useFediverseComposerState } from "../lib/use-fediverse-composer";

/**
 * The bookmarks list shown within the You page (see profile-view.tsx). A
 * plain, non-live list — bookmarks don't arrive in a fast-moving stream the
 * way a timeline does, but the same merge-not-replace approach (see
 * lib/timeline-merge.ts) is kept for consistency and to avoid the same
 * click-eating race on refresh.
 */
export function BookmarksPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const statusQuery = useQuery({ queryKey: ["fedipod", "status"], queryFn: api.fedipod.status });
  const capabilitiesQuery = useQuery({
    queryKey: ["fedipod", "capabilities"],
    queryFn: () => api.fedipod.capabilities(),
    enabled: Boolean(statusQuery.data?.connected),
  });
  const connected = Boolean(statusQuery.data?.connected);

  const bookmarksQuery = useQuery({
    queryKey: ["fedipod", "bookmarks"],
    queryFn: async () => {
      const fresh = await api.fedipod.bookmarks();
      const previous = queryClient.getQueryData<typeof fresh>(["fedipod", "bookmarks"]) ?? [];
      return mergeById(previous, fresh);
    },
    enabled: connected,
    refetchOnWindowFocus: "always",
  });

  const {
    composerOpen, replyTo, quoteTarget, openReply, openQuote,
    onOpenChange: handleComposerOpenChange, onCancelReply, onCancelQuote,
  } = useFediverseComposerState();

  // Hashtags clicked from a bookmarked post open that tag's feed on the
  // Fediverse view — same handoff status-thread-view.tsx and
  // feed-detail-view.tsx use.
  const openHashtag = React.useCallback((tag: string) => {
    try { sessionStorage.setItem("ailo:pending-hashtag", tag); } catch { /* ok */ }
    void navigate({ to: "/fediverse" });
  }, [navigate]);

  if (!connected) {
    return (
      <div className="px-1 py-8 text-center">
        <Text color="tertiary">{t("bookmarks.disconnected")}</Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {bookmarksQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 w-full animate-pulse rounded-card bg-control-subtle" />
          ))}
        </div>
      ) : bookmarksQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-secondary px-4 py-6 text-center">
          <Text color="secondary">{(bookmarksQuery.error as Error).message}</Text>
          <Button size="small" variant="filled" onClick={() => void bookmarksQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : bookmarksQuery.data?.length ? (
        bookmarksQuery.data.map((status) => (
          <StatusCard
            key={status.id}
            status={status}
            ownAccountId={statusQuery.data?.account?.id}
            onReply={openReply}
            onQuote={openQuote}
            onHashtag={openHashtag}
          />
        ))
      ) : (
        <Text color="tertiary" className="px-1 py-8 text-center">{t("bookmarks.empty")}</Text>
      )}

      <FediverseComposer
        open={composerOpen}
        onOpenChange={handleComposerOpenChange}
        replyTo={replyTo}
        onCancelReply={onCancelReply}
        quoteTarget={quoteTarget}
        onCancelQuote={onCancelQuote}
        capabilities={capabilitiesQuery.data}
      />
    </div>
  );
}
