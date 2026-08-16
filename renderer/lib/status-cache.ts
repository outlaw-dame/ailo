import type { QueryClient } from "@tanstack/react-query";
import type { MastodonStatus } from "./types";

// Favourite/boost/pin used to only invalidate ["fedipod", "timeline"] and
// ["fedipod", "notifications"] and wait for a refetch — so liking a post
// while looking at a custom feed, a hashtag timeline, "for you", or search
// results never showed anything happen: those queries live under different
// keys this list never named, so they were never asked to refetch. Every
// place a status can be cached lives under the shared ["fedipod", ...]
// prefix, so patching every one of them directly (using the server's own
// response, not a guess) is what actually reaches all of them, present and
// future, without maintaining an ever-growing, easy-to-forget list of keys.

function patchStatus(status: MastodonStatus, id: string, patch: Partial<MastodonStatus>): MastodonStatus {
  if (status.id === id) return { ...status, ...patch };
  if (status.reblog?.id === id) return { ...status, reblog: { ...status.reblog, ...patch } };
  return status;
}

function isStatus(value: unknown): value is MastodonStatus {
  return typeof value === "object" && value !== null && "id" in value && "content" in value;
}

function isNotificationLike(value: unknown): value is { status: MastodonStatus | null } {
  return typeof value === "object" && value !== null && "status" in value;
}

/** Applies `patch` to `id` (and, if `id` names a boost, its inner reblogged
 * status) in every cached list this status could be sitting in — plain
 * status arrays (timelines, search, custom feeds) and notification arrays
 * (whose `.status` field carries the same shape). Leaves anything that
 * isn't one of those shapes untouched. */
export function patchStatusInCaches(queryClient: QueryClient, id: string, patch: Partial<MastodonStatus>): void {
  queryClient.setQueriesData<unknown>({ queryKey: ["fedipod"] }, (data: unknown) => {
    if (!Array.isArray(data)) return data;
    return data.map((item) => {
      if (isStatus(item)) return patchStatus(item, id, patch);
      if (isNotificationLike(item) && item.status) return { ...item, status: patchStatus(item.status, id, patch) };
      return item;
    });
  });
}
