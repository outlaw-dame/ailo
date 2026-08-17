import { Notification } from "@glaze/core/backend";

import { JsonStore } from "./json-store.js";
import { t } from "./i18n.js";
import { openSettingsWindow } from "../windows/settings-window.js";
import type { ModerationStatsBundle } from "../types.js";

interface DigestState {
  lastShownAt: number | null;
}

function createDefault(): DigestState {
  return { lastShownAt: null };
}
function validate(value: unknown): DigestState {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { lastShownAt: typeof source.lastShownAt === "number" ? source.lastShownAt : null };
}

const store = new JsonStore<DigestState>("moderation-digest.json", createDefault, validate);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function summaryLine(stats: ModerationStatsBundle): string {
  const contentBlocked = stats.filteredPosts + stats.intakeBlockedPosts;
  const somethingNew = contentBlocked > 0 || stats.newBlockedAccounts > 0
    || stats.newMutedAccounts > 0 || stats.newBlockedDomains > 0;
  if (!somethingNew) return t("notifications.moderationDigestQuiet");
  return t("notifications.moderationDigestSummary", { count: contentBlocked });
}

/**
 * Shows a native "your weekly recap is ready" notification at most once
 * every 7 days, and only while the app happens to be running to see it —
 * there is no background wake-up here, so a week the app was never open
 * during just gets skipped rather than queued for later. Call this once
 * shortly after startup and again on a recurring interval (main/index.ts
 * does both); both calls are cheap no-ops except on the day they should
 * actually fire.
 *
 * There is no deferral on the very first check ever (a fresh install can
 * fire on its first launch) — the summary line degrades gracefully to "a
 * quiet week" when there is nothing to report yet, so an early digest is
 * harmless rather than misleading.
 */
export async function maybeShowWeeklyDigest(getStats: () => Promise<ModerationStatsBundle>): Promise<void> {
  if (!Notification.isSupported()) return;
  const state = await store.load();
  const now = Date.now();
  if (state.lastShownAt != null && now - state.lastShownAt < WEEK_MS) return;

  let stats: ModerationStatsBundle;
  try {
    stats = await getStats();
  } catch {
    return; // FediPod unreachable/unpaired — try again on the next check, don't mark as shown
  }

  await store.save({ lastShownAt: now });
  const notification = new Notification({
    title: t("notifications.moderationDigestTitle"),
    body: summaryLine(stats),
  });
  notification.on("click", () => { void openSettingsWindow("moderation"); });
  notification.show();
}
