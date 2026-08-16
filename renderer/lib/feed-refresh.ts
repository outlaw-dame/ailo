export const LIVE_REFRESH_INTERVAL_MS = 15_000;
export const MAX_REFRESH_BACKOFF_MS = 2 * 60_000;

/** Poll promptly while healthy, then back off after consecutive failures. */
export function feedRefreshInterval(failures: number): number {
  const safeFailures = Number.isFinite(failures) ? Math.max(0, Math.trunc(failures)) : 0;
  return Math.min(
    MAX_REFRESH_BACKOFF_MS,
    LIVE_REFRESH_INTERVAL_MS * (2 ** Math.min(safeFailures, 3)),
  );
}
