import { ipcMain, logger } from "@glaze/core/backend";

import { postsStore } from "../services/posts-store.js";
import { solidService } from "../services/solid-service.js";

export function registerSolidHandlers(): void {
  ipcMain.handle("solid:connect", async (_event, issuer: unknown) => {
    try {
      const result = await solidService.connect(
        typeof issuer === "string" && issuer.trim() ? issuer.trim() : undefined,
      );
      ipcMain.broadcast("solid:status-changed", {
        connected: true,
        webId: result.webId,
        issuer: result.issuer,
      });
      return { connected: true, ...result };
    } catch (error) {
      logger.error("solid", `connect failed: ${String(error)}`);
      throw error;
    }
  });

  ipcMain.handle("solid:disconnect", async () => {
    await solidService.disconnect();
    ipcMain.broadcast("solid:status-changed", { connected: false, webId: null, issuer: null });
    return { connected: false };
  });

  ipcMain.handle("solid:status", async () => {
    return solidService.getStatus();
  });

  ipcMain.handle("solid:publishPost", async (_event, postId: unknown) => {
    if (typeof postId !== "string" || !postId) throw new Error("Post id is required");
    try {
      const post = await postsStore.get(postId);
      if (!post) throw new Error(`Post not found: ${postId}`);
      const result = await solidService.publishPost(post);
      const updated = await postsStore.markPublished(postId, { solidUrl: result.url });
      return { post: updated, url: result.url };
    } catch (error) {
      logger.error("solid", `publishPost failed: ${String(error)}`);
      throw error;
    }
  });
}
