/**
 * Merges a freshly-fetched page of items into what's already displayed,
 * instead of the query just replacing the list outright on every refetch.
 *
 * Why this matters: a `<StatusCard key={id}>` keeps its React instance (and
 * DOM node) stable across renders as long as its key is still present in the
 * array — but if a refetch swaps in a totally different "latest N" page (as
 * a live, fast-moving home timeline reasonably can within a 15s poll
 * interval), ids that fall out of that window disappear from the array and
 * their DOM nodes get torn down. If that happens between a click's
 * mousedown and mouseup, the browser never fires the click at all — the
 * post just silently does nothing when tapped. Merging instead of replacing
 * keeps every already-shown item's identity stable (refreshed in place with
 * whatever's new about it — counts, favourited state, etc. — but never
 * removed just for aging out of the latest page), so an in-flight click always
 * lands on a still-live element. Only genuinely new items get prepended.
 */
export function mergeById<T extends { id: string }>(
  previous: T[],
  fresh: T[],
  maxSize = 200,
): T[] {
  const previousIds = new Set(previous.map((item) => item.id));
  const freshById = new Map(fresh.map((item) => [item.id, item]));
  const newOnes = fresh.filter((item) => !previousIds.has(item.id));
  const refreshedPrevious = previous.map((item) => freshById.get(item.id) ?? item);
  const merged = [...newOnes, ...refreshedPrevious];
  return merged.length > maxSize ? merged.slice(0, maxSize) : merged;
}
