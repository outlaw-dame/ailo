import { JsonStore } from "./json-store.js";
import {
  computeWeeklyStats,
  createDefaultState,
  validateState,
  withFilterHits,
  withModerationAction,
} from "./moderation-stats-logic.js";
import type { ModerationActionKind, ModerationState, ModerationWeeklyStats } from "./moderation-stats-logic.js";

export type { ModerationActionKind, ModerationWeeklyStats } from "./moderation-stats-logic.js";

// Local rolling log backing the Safety page's weekly moderation summary. Two
// kinds of numbers live here that FediPod cannot know on its own:
//   - "new this week" deltas for blocks/mutes/domain-blocks — FediPod's own
//     blocklist/muted files are a live SET with no history of when an entry
//     was added, and the action can be triggered from several places in the
//     UI. Recording it once here, at the service methods those UI paths all
//     funnel through (see fedipod-service.ts's setBlock/setMute/
//     setDomainBlock), is simpler and more complete than hooking every call
//     site in the renderer.
//   - keyword/semantic filter hits — matching happens client-side (see
//     renderer/lib/semantic-filter-service.ts), FediPod never sees it.
// What FediPod DOES know that Ailo cannot — content refused before delivery
// because of a block — is its own separate counter (store.mjs's
// recordModerationEvent, read via GET .../moderation/intake-stats).
const store = new JsonStore<ModerationState>("moderation-stats.json", createDefaultState, validateState);

export async function recordModerationAction(kind: ModerationActionKind): Promise<void> {
  await store.update((current) => withModerationAction(current, kind, Date.now()));
}

export async function recordFilterHits(keys: string[]): Promise<void> {
  if (!keys.length) return;
  await store.update((current) => withFilterHits(current, keys, Date.now()));
}

export async function weeklyStats(days = 7): Promise<ModerationWeeklyStats> {
  return computeWeeklyStats(await store.load(), days, Date.now());
}
