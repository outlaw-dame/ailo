import * as React from "react";

// Module-scoped (not component state) so the position survives navigating
// away from the Fediverse view and back within the same session, not just
// switching between its tabs.
const scrollPositions = new Map<string, number>();

function storageKey(key: string): string {
  return `ailo:scroll:${key}`;
}

function readPersisted(key: string): number | undefined {
  try {
    const raw = localStorage.getItem(storageKey(key));
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function writePersisted(key: string, value: number): void {
  try {
    localStorage.setItem(storageKey(key), String(Math.round(value)));
  } catch {
    // Storage unavailable or full — losing the "remember my spot" nicety
    // isn't worth surfacing an error for.
  }
}

/**
 * Remembers and restores scroll position for a scrollable view, keyed by
 * `key` (e.g. which tab/tag is active), so switching away and back — or
 * quitting and relaunching the app, for `persist: true` keys — leaves the
 * reader where they left off instead of snapping back to the top.
 *
 * Restoration only fires once content is actually present (`ready`) and
 * only once per distinct `key`, so it doesn't fight the user's own
 * subsequent scrolling.
 */
export function useScrollMemory(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  key: string,
  ready: boolean,
  options?: { persist?: boolean },
): void {
  const persist = options?.persist ?? false;
  const restoredKeyRef = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node || !ready) return;
    if (restoredKeyRef.current === key) return;
    restoredKeyRef.current = key;
    const saved = scrollPositions.get(key) ?? (persist ? readPersisted(key) : undefined);
    if (saved) node.scrollTop = saved;
    // (viewportRef is a stable ref object.)
  }, [key, ready, persist]);

  React.useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const handleScroll = () => {
      const top = node.scrollTop;
      scrollPositions.set(key, top);
      if (persist) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => writePersisted(key, top), 300);
      }
    };
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", handleScroll);
      if (timeout) clearTimeout(timeout);
    };
  }, [key, persist]);
}
