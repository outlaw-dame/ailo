import { ipcMain, logger } from "@glaze/core/backend";

import { profileStore } from "../services/profile-store.js";
import type { Profile } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accept only http:// or https:// URLs. Returns an empty string for anything
 * else (blank, data:, javascript:, file:, etc.) so bogus values are silently
 * cleared rather than stored.
 */
function safeImageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return trimmed;
  } catch {
    // not a valid URL
  }
  return "";
}

function parseProfilePatch(value: unknown): Partial<Profile> {
  if (!isRecord(value)) throw new Error("Profile payload must be an object");
  const patch: Partial<Profile> = {};
  if (typeof value.displayName === "string") patch.displayName = value.displayName;
  if (typeof value.bio === "string") patch.bio = value.bio;
  if (value.avatarUrl !== undefined) patch.avatarUrl = safeImageUrl(value.avatarUrl);
  if (value.bannerUrl !== undefined) patch.bannerUrl = safeImageUrl(value.bannerUrl);
  if (typeof value.calComPath === "string") patch.calComPath = value.calComPath;
  if (typeof value.solidIssuer === "string") patch.solidIssuer = value.solidIssuer;
  if (typeof value.solidPodRoot === "string") patch.solidPodRoot = value.solidPodRoot;
  if (typeof value.fediverseCreatorEnabled === "boolean") {
    patch.fediverseCreatorEnabled = value.fediverseCreatorEnabled;
  }
  return patch;
}

export function registerProfileHandlers(): void {
  ipcMain.handle("profile:get", async () => {
    return profileStore.get();
  });

  ipcMain.handle("profile:update", async (_event, payload: unknown) => {
    try {
      const updated = await profileStore.update(parseProfilePatch(payload));
      ipcMain.broadcast("profile:changed", { profile: updated });
      return updated;
    } catch (error) {
      logger.error("profile", `update failed: ${String(error)}`);
      throw error;
    }
  });
}
