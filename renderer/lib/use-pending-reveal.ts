import * as React from "react";

/**
 * Splits an ever-growing, merged timeline into what's currently shown vs.
 * what just arrived, so a background refetch never inserts new posts above
 * whatever the reader is currently looking at — Phanpy's "new posts" model.
 * New arrivals sit behind a `pendingCount` (surfaced as a "N new posts"
 * affordance by the caller) until revealed, except when the viewport is
 * already scrolled to the top — there's nothing to disrupt there, so they
 * show immediately, matching what a reader would expect.
 *
 * `resetKey` forces a fresh reveal-everything baseline (e.g. when switching
 * which hashtag's feed is showing) instead of comparing against a previous
 * tag's ids.
 */
export function usePendingReveal<T extends { id: string }>(
  data: T[] | undefined,
  viewportRef: React.RefObject<HTMLDivElement | null>,
  resetKey: unknown,
): { visible: T[]; pendingCount: number; reveal: () => void } {
  const [revealedIds, setRevealedIds] = React.useState<Set<string> | null>(null);
  const resetKeyRef = React.useRef(resetKey);

  React.useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      setRevealedIds(null);
    }
  }, [resetKey]);

  React.useEffect(() => {
    if (!data) return;
    setRevealedIds((current) => {
      if (!current) return new Set(data.map((item) => item.id));
      const atTop = (viewportRef.current?.scrollTop ?? 0) < 40;
      if (!atTop) return current;
      const allIds = new Set(data.map((item) => item.id));
      // Avoid a needless state update (and re-render) once everything is
      // already revealed and nothing new has arrived.
      if (current.size === allIds.size && [...allIds].every((id) => current.has(id))) return current;
      return allIds;
      // (viewportRef is a stable ref object; only `data` needs to retrigger this.)
    });
  }, [data]);

  const visible = React.useMemo(
    () => (data && revealedIds ? data.filter((item) => revealedIds.has(item.id)) : data ?? []),
    [data, revealedIds],
  );
  const pendingCount = data ? data.length - visible.length : 0;

  const reveal = React.useCallback(() => {
    if (!data) return;
    setRevealedIds(new Set(data.map((item) => item.id)));
    viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [data, viewportRef]);

  return { visible, pendingCount, reveal };
}
