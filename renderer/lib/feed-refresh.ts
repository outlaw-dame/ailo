export const LIVE_REFRESH_INTERVAL_MS = 15_000;
export const MAX_REFRESH_BACKOFF_MS = 2 * 60_000;

/** How close to the top (px) counts as "near the top" for backoff purposes. */
export const NEAR_TOP_THRESHOLD_PX = 44;

/** Poll promptly while healthy, then back off after consecutive failures. */
export function feedRefreshInterval(failures: number): number {
  const safeFailures = Number.isFinite(failures) ? Math.max(0, Math.trunc(failures)) : 0;
  return Math.min(
    MAX_REFRESH_BACKOFF_MS,
    LIVE_REFRESH_INTERVAL_MS * (2 ** Math.min(safeFailures, 3)),
  );
}

/**
 * Matches Phanpy's actual timeline-polling behavior (its own
 * checkForUpdatesInterval logic): poll at half frequency while the reader
 * isn't near the top of the list — nothing is being auto-inserted while
 * they're reading further down, so there's less urgency — and pause polling
 * entirely once there's already an unrevealed "new posts" batch sitting
 * there, so a reader who hasn't acted on the last update doesn't keep
 * costing a request (and, for filtered feeds, a full semantic-filter pass)
 * every cycle for updates they haven't even looked at yet.
 */
export function adaptiveRefetchInterval(
  failures: number,
  pendingCount: number,
  nearTop: boolean,
): number | false {
  if (pendingCount > 0) return false;
  return feedRefreshInterval(failures) * (nearTop ? 1 : 2);
}
