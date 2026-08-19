import { ipcMain, logger } from "@glaze/core/backend";

import { fediPodService } from "../services/fedipod-service.js";
import { githubService } from "../services/github-service.js";
import { postsStore } from "../services/posts-store.js";
import { profileStore } from "../services/profile-store.js";
import { solidService } from "../services/solid-service.js";
import { postNotFoundError, requireString } from "../services/handler-validation.js";

/**
 * Unified publish: marks the post published locally, then pushes to any
 * connected destinations (Solid Pod and/or GitHub repo).
 */
export function registerPublishHandlers(): void {
  ipcMain.handle("publish:post", async (_event, rawPostId: unknown) => {
    const postId = requireString(rawPostId, "backendFields.postId");

    try {
      const post = await postsStore.get(postId);
      if (!post) throw postNotFoundError(postId);

      // Ensure local status flips to published even if remote targets fail.
      let updated = await postsStore.update(postId, { status: "published" });

      const profile = await profileStore.get();
      const results: {
        solid?: { ok: true; url: string } | { ok: false; error: string };
        github?: { ok: true; path: string; htmlUrl: string } | { ok: false; error: string };
        fediverse?: { ok: true; url: string | null } | { ok: false; error: string };
      } = {};

      const solidStatus = await solidService.getStatus();
      if (solidStatus.connected) {
        try {
          const solid = await solidService.publishPost(updated);
          updated = await postsStore.markPublished(postId, { solidUrl: solid.url });
          results.solid = { ok: true, url: solid.url };
        } catch (error) {
          results.solid = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }

      const githubConnected = await githubService.isConnected();
      if (githubConnected && profile.githubRepo) {
        try {
          const github = await githubService.publishPost(updated);
          updated = await postsStore.markPublished(postId, { githubPath: github.path });
          results.github = { ok: true, path: github.path, htmlUrl: github.htmlUrl };
        } catch (error) {
          results.github = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      const fediConnected = await fediPodService.isConnected();
      if (fediConnected) {
        try {
          const fedi = await fediPodService.crossPostStory(updated, "public");
          results.fediverse = { ok: true, url: fedi.url };
        } catch (error) {
          results.fediverse = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      return { post: updated, results };
    } catch (error) {
      logger.error("publish", `publish failed: ${String(error)}`);
      throw error;
    }
  });
}
