import { ipcMain, logger } from "@glaze/core/backend";

import { githubService } from "../services/github-service.js";
import { postsStore } from "../services/posts-store.js";
import { profileStore } from "../services/profile-store.js";

export function registerGitHubHandlers(): void {
  ipcMain.handle("github:connect", async () => {
    try {
      const user = await githubService.connect();
      ipcMain.broadcast("github:status-changed", { connected: true, login: user.login });
      return { connected: true, user };
    } catch (error) {
      logger.error("github", `connect failed: ${String(error)}`);
      throw error;
    }
  });

  ipcMain.handle("github:disconnect", async () => {
    await githubService.disconnect();
    ipcMain.broadcast("github:status-changed", { connected: false, login: null });
    return { connected: false };
  });

  ipcMain.handle("github:status", async () => {
    const connected = await githubService.isConnected();
    const profile = await profileStore.get();
    let user = null;
    if (connected) {
      try {
        user = await githubService.getViewer();
      } catch {
        return { connected: false, user: null, repo: profile.githubRepo };
      }
    }
    return { connected, user, repo: profile.githubRepo };
  });

  ipcMain.handle("github:listRepos", async () => {
    return githubService.listRepos();
  });

  ipcMain.handle("github:createRepo", async (_event, name: unknown, isPrivate: unknown) => {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Repository name is required");
    }
    try {
      const repo = await githubService.createRepo(name, Boolean(isPrivate));
      ipcMain.broadcast("github:status-changed", {
        connected: true,
        repo: repo.fullName,
      });
      return repo;
    } catch (error) {
      logger.error("github", `createRepo failed: ${String(error)}`);
      throw error;
    }
  });

  ipcMain.handle("github:setRepo", async (_event, fullName: unknown) => {
    if (typeof fullName !== "string" || !fullName.includes("/")) {
      throw new Error("Repository must be owner/name");
    }
    await githubService.setActiveRepo(fullName);
    ipcMain.broadcast("github:status-changed", { repo: fullName });
    return { repo: fullName };
  });

  ipcMain.handle("github:publishPost", async (_event, postId: unknown) => {
    if (typeof postId !== "string" || !postId) throw new Error("Post id is required");
    try {
      const post = await postsStore.get(postId);
      if (!post) throw new Error(`Post not found: ${postId}`);
      const result = await githubService.publishPost(post);
      const updated = await postsStore.markPublished(postId, { githubPath: result.path });
      return { post: updated, publish: result };
    } catch (error) {
      logger.error("github", `publishPost failed: ${String(error)}`);
      throw error;
    }
  });
}
