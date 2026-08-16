// Pure logic behind moderation-stats.ts, split out so it's testable without
// @glaze/core/backend (JsonStore needs `app`, which only exists inside a
// running Electron main process) — same reasoning as fedipod-filter-input.ts.

export type ModerationActionKind = "block" | "mute" | "domain-block";
export type ModerationEventKind = ModerationActionKind | "filter-hit";

export interface ModerationEvent {
  ts: number;
  kind: ModerationEventKind;
}

export interface ModerationState {
  events: ModerationEvent[];
  // statusId::filterId → last-recorded ts, so a post caught by a filter is
  // counted once, not once per poll/refresh it stays visible for.
  seenFilterHits: Record<string, number>;
}

export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_EVENTS = 5_000;
export const FILTER_HIT_DEDUPE_MS = 20 * 60 * 60 * 1000;

export function createDefaultState(): ModerationState {
  return { events: [], seenFilterHits: {} };
}

function isEvent(value: unknown): value is ModerationEvent {
  return !!value && typeof value === "object"
    && typeof (value as { ts?: unknown }).ts === "number"
    && typeof (value as { kind?: unknown }).kind === "string";
}

export function validateState(value: unknown): ModerationState {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const events = Array.isArray(source.events) ? source.events.filter(isEvent) : [];
  const rawSeen = source.seenFilterHits && typeof source.seenFilterHits === "object"
    ? source.seenFilterHits as Record<string, unknown> : {};
  const seenFilterHits = Object.fromEntries(
    Object.entries(rawSeen).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
  return { events, seenFilterHits };
}

/** Drops events/dedupe entries past MAX_AGE_MS, caps the event log at MAX_EVENTS. */
export function pruneState(state: ModerationState, now: number): ModerationState {
  const cutoff = now - MAX_AGE_MS;
  const events = state.events.filter((event) => event.ts >= cutoff).slice(-MAX_EVENTS);
  const seenFilterHits = Object.fromEntries(
    Object.entries(state.seenFilterHits).filter(([, ts]) => ts >= cutoff),
  );
  return { events, seenFilterHits };
}

export function withModerationAction(state: ModerationState, kind: ModerationActionKind, now: number): ModerationState {
  const pruned = pruneState(state, now);
  pruned.events.push({ ts: now, kind });
  pruned.events = pruned.events.slice(-MAX_EVENTS);
  return pruned;
}

/** `keys` are `${statusId}::${filterId}` pairs matched in one filtering pass. */
export function withFilterHits(state: ModerationState, keys: string[], now: number): ModerationState {
  const pruned = pruneState(state, now);
  for (const key of new Set(keys)) {
    const lastSeen = pruned.seenFilterHits[key];
    if (lastSeen != null && now - lastSeen < FILTER_HIT_DEDUPE_MS) continue;
    pruned.seenFilterHits[key] = now;
    pruned.events.push({ ts: now, kind: "filter-hit" });
  }
  pruned.events = pruned.events.slice(-MAX_EVENTS);
  return pruned;
}

export interface ModerationWeeklyStats {
  newBlocks: number;
  newMutes: number;
  newDomainBlocks: number;
  filteredPosts: number;
}

export function computeWeeklyStats(state: ModerationState, days: number, now: number): ModerationWeeklyStats {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const recent = state.events.filter((event) => event.ts >= cutoff);
  const count = (kind: ModerationEventKind) => recent.filter((event) => event.kind === kind).length;
  return {
    newBlocks: count("block"),
    newMutes: count("mute"),
    newDomainBlocks: count("domain-block"),
    filteredPosts: count("filter-hit"),
  };
}
