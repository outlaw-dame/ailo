import { ipcMain, logger } from "@glaze/core/backend";

import { fediPodService } from "../services/fedipod-service.js";
import { postsStore } from "../services/posts-store.js";
import type { FediverseContentType, FediverseObjectType, FediverseVisibility } from "../types.js";

const VISIBILITIES: FediverseVisibility[] = ["public", "unlisted", "private", "direct"];
const OBJECT_TYPES: FediverseObjectType[] = ["Note", "Article"];
const CONTENT_TYPES: FediverseContentType[] = ["text/plain", "text/markdown", "text/x.misskeymarkdown"];

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

  ipcMain.handle("fedipod:blocks", async () => fediPodService.fetchBlockedAccounts());
  ipcMain.handle("fedipod:mutes", async () => fediPodService.fetchMutedAccounts());
  ipcMain.handle("fedipod:filters", async () => fediPodService.fetchFilters());

  ipcMain.handle("fedipod:block", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setBlock(requireString(id, "Account id"), active !== false);
  });

  ipcMain.handle("fedipod:mute", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setMute(requireString(id, "Account id"), active !== false);
  });

  ipcMain.handle("fedipod:createFilter", async (_event, input: unknown) => {
    const data = typeof input === "object" && input !== null
      ? (input as Record<string, unknown>) : {};
    return fediPodService.createFilter({
      title: requireString(data.title, "Filter title"),
      keyword: requireString(data.keyword, "Filter keyword"),
      wholeWord: data.wholeWord === true,
      semantic: data.semantic !== false,
      semanticThreshold: typeof data.semanticThreshold === "number"
        ? Math.min(0.9, Math.max(0.3, data.semanticThreshold)) : 0.55,
      action: data.action === "hide" ? "hide" : "warn",
    });
  });

  ipcMain.handle("fedipod:deleteFilter", async (_event, id: unknown) => {
    await fediPodService.deleteFilter(requireString(id, "Filter id"));
    return { ok: true };
  });

  ipcMain.handle("fedipod:capabilities", async () => fediPodService.fetchCapabilities());

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
      objectType: OBJECT_TYPES.includes(data.objectType as FediverseObjectType)
        ? (data.objectType as FediverseObjectType)
        : "Note",
      title: typeof data.title === "string" ? data.title : null,
      contentType: CONTENT_TYPES.includes(data.contentType as FediverseContentType)
        ? (data.contentType as FediverseContentType)
        : "text/plain",
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
