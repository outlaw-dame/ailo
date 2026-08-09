import { ipcMain, logger } from "@glaze/core/backend";

import { fediPodService } from "../services/fedipod-service.js";
import { postsStore } from "../services/posts-store.js";
import type { FediverseVisibility } from "../types.js";

const VISIBILITIES: FediverseVisibility[] = ["public", "unlisted", "private", "direct"];

function asVisibility(value: unknown): FediverseVisibility {
  return typeof value === "string" && (VISIBILITIES as string[]).includes(value)
    ? (value as FediverseVisibility)
    : "public";
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value;
}

export function registerFediPodHandlers(): void {
  ipcMain.handle("fedipod:status", async () => {
    return fediPodService.getStatus();
  });

  ipcMain.handle("fedipod:connect", async (_event, baseUrl: unknown, token: unknown) => {
    try {
      const account = await fediPodService.connect(
        requireString(baseUrl, "FediPod URL"),
        requireString(token, "Access token"),
      );
      const status = await fediPodService.getStatus();
      ipcMain.broadcast("fedipod:status-changed", status);
      return { connected: true, account };
    } catch (error) {
      logger.error("fedipod", `connect failed: ${String(error)}`);
      throw error;
    }
  });

  ipcMain.handle("fedipod:login", async (_event, baseUrl: unknown, password: unknown) => {
    try {
      const result = await fediPodService.loginWithOneClick(
        requireString(baseUrl, "FediPod URL"),
        typeof password === "string" && password.trim() ? password.trim() : undefined,
      );
      if (result.status === "connected") {
        const status = await fediPodService.getStatus();
        ipcMain.broadcast("fedipod:status-changed", status);
      }
      return result;
    } catch (error) {
      logger.error("fedipod", `login failed: ${String(error)}`);
      throw error;
    }
  });

  ipcMain.handle("fedipod:disconnect", async () => {
    await fediPodService.disconnect();
    ipcMain.broadcast("fedipod:status-changed", {
      connected: false,
      baseUrl: "",
      account: null,
    });
    return { connected: false };
  });

  ipcMain.handle("fedipod:timeline", async (_event, options: unknown) => {
    const opts =
      typeof options === "object" && options !== null ? (options as Record<string, unknown>) : {};
    return fediPodService.fetchHomeTimeline({
      maxId: typeof opts.maxId === "string" ? opts.maxId : undefined,
      limit: typeof opts.limit === "number" ? opts.limit : undefined,
    });
  });

  ipcMain.handle("fedipod:notifications", async () => {
    return fediPodService.fetchNotifications();
  });

  ipcMain.handle("fedipod:resolveCommunity", async (_event, handle: unknown) => {
    return fediPodService.resolveCommunity(requireString(handle, "Community handle"));
  });

  ipcMain.handle("fedipod:post", async (_event, input: unknown) => {
    const data =
      typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    return fediPodService.postStatus({
      status: requireString(data.status, "Status text"),
      spoilerText: typeof data.spoilerText === "string" ? data.spoilerText : null,
      visibility: asVisibility(data.visibility),
      inReplyToId: typeof data.inReplyToId === "string" ? data.inReplyToId : null,
      community: typeof data.community === "string" ? data.community : null,
    });
  });

  ipcMain.handle("fedipod:favourite", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setFavourite(requireString(id, "Status id"), active !== false);
  });

  ipcMain.handle("fedipod:boost", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setBoost(requireString(id, "Status id"), active !== false);
  });

  ipcMain.handle("fedipod:follow", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setFollow(requireString(id, "Account id"), active !== false);
  });

  ipcMain.handle("fedipod:crossPost", async (_event, postId: unknown, visibility: unknown) => {
    const post = await postsStore.get(requireString(postId, "Post id"));
    if (!post) throw new Error(`Post not found: ${String(postId)}`);
    return fediPodService.crossPostStory(post, asVisibility(visibility));
  });
}
