import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, ScrollArea, Text, ToolbarBackButton } from "@glaze/core/components";

import { StatusCard } from "../components/status-card";
import { FediverseComposer } from "../components/fediverse-composer";
import { api } from "../lib/api";
import { mergeById } from "../lib/timeline-merge";
import { useFediverseComposerState } from "../lib/use-fediverse-composer";
import type { MastodonStatus } from "../lib/types";

// ---------------------------------------------------------------------------
// Thread builder
// ---------------------------------------------------------------------------

interface ThreadItem {
  status: MastodonStatus;
  /** Visual nesting depth relative to the focal post (0 = same level). */
  depth: number;
  isFocal: boolean;
  /**
   * Whether a vertical connector line should be drawn *above* this item,
   * joining it visually to the item above it in the same chain.
   */
  hasLineAbove: boolean;
  /**
   * Whether a vertical connector line should be drawn *below* this item,
   * joining it to the next item in the same chain.
   */
  hasLineBelow: boolean;
}

/**
 * Builds a display-ordered, depth-annotated flat list from an
 * ancestor → focal → descendant context response.
 *
 * Rules (matching Phanpy's visual model, with improvements):
 *
 * Ancestors
 *   All drawn at depth 0 in chronological order.  They form a single
 *   linear chain with connector lines between every pair.
 *
 * Focal post
 *   Drawn at depth 0, highlighted.  Connector above if there are ancestors,
 *   connector below if there are any direct replies.
 *
 * Descendants
 *   Mastodon returns them depth-first, chronologically within each branch.
 *   We compute each item's depth by tracing inReplyToId through a map
 *   (ancestors, focal, and already-processed descendants all seed the map).
 *   Depth is capped at 4 to prevent runaway indentation.
 *
 *   Connector lines connect each item to the item directly above it *in the
 *   same chain* — i.e. only when that item is the parent.
 */
function buildThread(
  ancestors: MastodonStatus[],
  focal: MastodonStatus,
  descendants: MastodonStatus[],
): ThreadItem[] {
  const result: ThreadItem[] = [];

  // Seed the depth map with every known id → depth.
  // Ancestors are all at depth 0 for display purposes; the key thing is
  // that each one is the parent of the next, so connector lines fire between them.
  const depthMap = new Map<string, number>();
  for (const s of ancestors) depthMap.set(s.id, 0);
  depthMap.set(focal.id, 0);

  // --- ancestors ---
  for (let i = 0; i < ancestors.length; i++) {
    const s = ancestors[i];
    result.push({
      status: s,
      depth: 0,
      isFocal: false,
      // Line above: connect to the previous ancestor.
      hasLineAbove: i > 0,
      // Line below: always connect down toward the focal post.
      hasLineBelow: true,
    });
  }

  // --- focal post ---
  result.push({
    status: focal,
    depth: 0,
    isFocal: true,
    hasLineAbove: ancestors.length > 0,
    // Will be updated below once we know whether there are direct replies.
    hasLineBelow: false,
  });

  // --- descendants ---
  for (let i = 0; i < descendants.length; i++) {
    const s = descendants[i];
    const parentDepth = s.inReplyToId != null ? (depthMap.get(s.inReplyToId) ?? 0) : 0;
    const depth = Math.min(parentDepth + 1, 4);
    depthMap.set(s.id, depth);

    // Connect to the item above only when that item is the direct parent.
    const prevItem = result[result.length - 1];
    const isDirectChild = prevItem && s.inReplyToId === prevItem.status.id;

    // Does this item have a direct child next?
    const nextStatus = descendants[i + 1];
    const hasDirectChildNext =
      nextStatus != null && nextStatus.inReplyToId === s.id;

    result.push({
      status: s,
      depth,
      isFocal: false,
      hasLineAbove: isDirectChild,
      hasLineBelow: hasDirectChildNext,
    });

    // Mark the item above as having a line below when this is its direct child.
    if (isDirectChild && result.length >= 2) {
      result[result.length - 2].hasLineBelow = true;
    }
  }

  // Update focal post's hasLineBelow now that descendants are processed.
  const focalIndex = result.findIndex((item) => item.isFocal);
  if (focalIndex !== -1 && focalIndex < result.length - 1) {
    const nextItem = result[focalIndex + 1];
    result[focalIndex].hasLineBelow =
      nextItem != null && nextItem.status.inReplyToId === focal.id;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ThreadSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("statusThread.loadingAriaLabel")}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 w-full animate-pulse rounded-card bg-control-subtle" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indentation constants
// ---------------------------------------------------------------------------

// Left margin in px per depth level (depths 0–4).
const INDENT = [0, 20, 40, 56, 68] as const;

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function StatusThreadView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { statusId } = useParams({ from: "/fediverse/status/$statusId" });

  const focalRef = React.useRef<HTMLDivElement>(null);
  const scrolledRef = React.useRef(false);

  // The combined context call fetches the status AND its thread in one round
  // trip. We still keep a separate getStatus query for instant seeding from
  // the timeline cache (so the focal post renders immediately).
  const contextQuery = useQuery({
    queryKey: ["fedipod", "status-context", statusId],
    queryFn: async () => {
      const fresh = await api.fedipod.statusContext(statusId);
      // Merge rather than replace, same reasoning as the home timeline (see
      // lib/timeline-merge.ts): keeps an already-rendered reply's DOM node
      // stable across the 15s refresh instead of tearing it down mid-click.
      const previous = queryClient.getQueryData<typeof fresh>(["fedipod", "status-context", statusId]);
      if (!previous) return fresh;
      return {
        status: fresh.status,
        ancestors: mergeById(previous.ancestors, fresh.ancestors),
        descendants: mergeById(previous.descendants, fresh.descendants),
      };
    },
    // Context stale quickly — new replies come in. No refetchOnWindowFocus
    // override: the default already refetches on focus once this staleTime
    // has elapsed, without forcing it on every focus flicker regardless of
    // freshness.
    staleTime: 15_000,
  });

  // Seed the focal post immediately from any cached timeline data so it
  // renders before the context fetch completes.
  const cachedStatus = React.useMemo((): MastodonStatus | undefined => {
    // The context query already returns the (possibly refreshed) status; once
    // it resolves we no longer need the seed.
    if (contextQuery.data) return undefined;

    // Walk all query cache entries looking for a list that contains this id.
    const allData = queryClient.getQueriesData<MastodonStatus[] | MastodonStatus>({
      predicate: (q) => {
        const key = q.queryKey;
        return Array.isArray(key) && key[0] === "fedipod";
      },
    });
    for (const [, data] of allData) {
      if (!data) continue;
      if (Array.isArray(data)) {
        const found = (data as MastodonStatus[]).find((s) => s?.id === statusId);
        if (found) return found;
        // Also check reblog wrappers.
        for (const s of data as MastodonStatus[]) {
          if (s?.reblog?.id === statusId) return s.reblog;
        }
      } else if (typeof data === "object" && "id" in data && (data as MastodonStatus).id === statusId) {
        return data as MastodonStatus;
      }
    }
    return undefined;
  }, [contextQuery.data, queryClient, statusId]);

  const fedipodStatus = useQuery({
    queryKey: ["fedipod", "status"],
    queryFn: () => api.fedipod.status(),
    staleTime: Infinity,
  });

  const capabilitiesQuery = useQuery({
    queryKey: ["fedipod", "capabilities"],
    queryFn: () => api.fedipod.capabilities(),
    staleTime: Infinity,
  });

  const {
    composerOpen, replyTo, quoteTarget, openReply, openQuote,
    onOpenChange: handleComposerOpenChange, onCancelReply, onCancelQuote,
  } = useFediverseComposerState();

  // Hashtag clicks go back to the Fediverse view and open that hashtag.
  // We store the tag in a ref that the fediverse view can read on mount.
  // For now navigate back (the tag-feed is on the fediverse view itself).
  const openHashtag = React.useCallback(
    (tag: string) => {
      // Store intent in sessionStorage so fediverse-view can pick it up.
      try { sessionStorage.setItem("ailo:pending-hashtag", tag); } catch { /* ok */ }
      void navigate({ to: "/fediverse" });
    },
    [navigate],
  );

  const isLoading = contextQuery.isLoading && !cachedStatus;
  const isError = contextQuery.isError;
  const errorMessage =
    (contextQuery.error as Error | undefined)?.message ??
    t("common.unknownError", { defaultValue: "Something went wrong" });

  const ownAccountId = fedipodStatus.data?.account?.id ?? null;

  const focalStatus = contextQuery.data?.status ?? cachedStatus ?? null;
  const thread = React.useMemo<ThreadItem[] | null>(() => {
    if (!focalStatus) return null;
    return buildThread(
      contextQuery.data?.ancestors ?? [],
      focalStatus,
      contextQuery.data?.descendants ?? [],
    );
  }, [focalStatus, contextQuery.data]);

  // Scroll the focal post into view the first time the thread renders.
  React.useEffect(() => {
    if (!thread || scrolledRef.current) return;
    if (!focalRef.current) return;
    scrolledRef.current = true;
    // Use requestAnimationFrame to let the layout settle first.
    requestAnimationFrame(() => {
      focalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [thread]);

  // Re-seed status cache when we get a fresher version back from origin.
  React.useEffect(() => {
    if (!contextQuery.data?.status) return;
    // Patch every cached list that holds this status with the refreshed copy.
    // We don't import patchStatusInCaches here to keep the coupling minimal —
    // just invalidate the specific status key so any other viewer gets fresh data.
    void queryClient.invalidateQueries({ queryKey: ["fedipod", "status", statusId] });
  }, [contextQuery.data?.status, queryClient, statusId]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["fedipod", "status-context", statusId] });
  };

  // Also handle reply success: after posting a reply, refresh the thread.
  const prevComposerOpen = React.useRef(composerOpen);
  React.useEffect(() => {
    if (prevComposerOpen.current && !composerOpen) {
      // Composer just closed — a reply may have been submitted.
      // Delay slightly to give FediPod time to federate the reply.
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["fedipod", "status-context", statusId] });
      }, 1_500);
    }
    prevComposerOpen.current = composerOpen;
  }, [composerOpen, queryClient, statusId]);

  return (
    <div className="relative h-full">
      <ScrollArea
        title={t("statusThread.title", { defaultValue: "Post" })}
        leading={<ToolbarBackButton onClick={() => void navigate({ to: "/fediverse" })} />}
        actions={
          <Button
            size="small"
            variant="filled"
            iconOnly
            aria-label={t("common.refresh", { defaultValue: "Refresh" })}
            disabled={contextQuery.isFetching}
            onClick={refresh}
          >
            <RefreshCw className={contextQuery.isFetching ? "animate-spin" : undefined} />
          </Button>
        }
        className="h-full"
      >
        <div className="flex max-w-2xl flex-col px-6 py-4">
          {isLoading ? (
            <ThreadSkeleton />
          ) : isError && !thread ? (
            <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-secondary px-4 py-6 text-center">
              <Text color="secondary">{errorMessage}</Text>
              <Button size="small" variant="filled" onClick={refresh}>
                {t("common.retry")}
              </Button>
            </div>
          ) : thread ? (
            <div className="flex flex-col">
              {thread.map(({ status, depth, isFocal, hasLineAbove, hasLineBelow }) => (
                <ThreadRow
                  key={status.id}
                  status={status}
                  depth={depth}
                  isFocal={isFocal}
                  hasLineAbove={hasLineAbove}
                  hasLineBelow={hasLineBelow}
                  focalRef={isFocal ? focalRef : undefined}
                  ownAccountId={ownAccountId}
                  onReply={openReply}
                  onQuote={openQuote}
                  onHashtag={openHashtag}
                />
              ))}
              {/* If context is still loading while we have the focal from cache, show a subtle loading hint */}
              {contextQuery.isLoading && cachedStatus ? (
                <div className="mt-3 flex flex-col gap-2 px-1">
                  <div className="h-20 animate-pulse rounded-card bg-control-subtle opacity-60" />
                </div>
              ) : null}
              {/* Non-blocking error banner — show when context failed but we still have the focal post */}
              {contextQuery.isError && cachedStatus ? (
                <div className="mt-3 flex items-center gap-3 rounded-card border border-dashed border-secondary px-4 py-3">
                  <Text variant="small" color="secondary" className="flex-1">
                    {t("statusThread.contextError", { defaultValue: "Could not load replies." })}
                  </Text>
                  <Button size="small" variant="filled" onClick={refresh}>
                    {t("common.retry")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </ScrollArea>

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

// ---------------------------------------------------------------------------
// ThreadRow — isolated so the ref callback doesn't force full list re-renders
// ---------------------------------------------------------------------------

const ThreadRow = React.memo(function ThreadRow({
  status,
  depth,
  isFocal,
  hasLineAbove,
  hasLineBelow,
  focalRef,
  ownAccountId,
  onReply,
  onQuote,
  onHashtag,
}: {
  status: MastodonStatus;
  depth: number;
  isFocal: boolean;
  hasLineAbove: boolean;
  hasLineBelow: boolean;
  focalRef?: React.RefObject<HTMLDivElement | null>;
  ownAccountId: string | null;
  onReply: (s: MastodonStatus) => void;
  onQuote: (s: MastodonStatus) => void;
  onHashtag: (tag: string) => void;
}) {
  const marginLeft = INDENT[depth] ?? INDENT[INDENT.length - 1];

  // The connector lines sit in the left gutter of the *parent* depth (depth - 1),
  // roughly aligned with the avatar column of the card at depth - 1.
  // Avatar left edge is at: marginLeft + 16px card-padding ≈ marginLeft + 4px
  // We draw the line at a fixed offset that lines up with the avatar circle centre.
  const lineLeft = depth > 0 ? (INDENT[depth - 1] ?? 0) + 20 : 20;

  return (
    <div ref={focalRef} className="relative flex flex-col">
      {/* Connector line above this item */}
      {hasLineAbove ? (
        <div
          className="absolute top-0 w-px bg-secondary/50"
          style={{ left: lineLeft, height: 8 }}
          aria-hidden
        />
      ) : null}

      <div
        style={{ marginLeft }}
        className={
          isFocal
            ? "rounded-card ring-2 ring-accent ring-offset-2 ring-offset-background"
            : undefined
        }
      >
        <StatusCard
          status={status}
          ownAccountId={ownAccountId}
          onReply={onReply}
          onQuote={onQuote}
          onHashtag={onHashtag}
          // In the thread view, clicking a non-focal status navigates to its
          // own thread. The focal post itself is already the subject of the
          // page — disable click-to-navigate on it to avoid a no-op round trip.
          onStatusClick={isFocal ? null : undefined}
        />
      </div>

      {/* Connector line below this item */}
      {hasLineBelow ? (
        <div
          className="absolute bottom-0 w-px bg-secondary/50"
          style={{ left: lineLeft, height: 8 }}
          aria-hidden
        />
      ) : null}
    </div>
  );
});
