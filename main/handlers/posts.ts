import { ipcMain, logger } from "@glaze/core/backend";

import { postsStore, type PostInput } from "../services/posts-store.js";
import { t } from "../services/i18n.js";
import { requireString } from "../services/handler-validation.js";
import type { ImageAltText } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAltTexts(value: unknown): ImageAltText[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      src: typeof item.src === "string" ? item.src : "",
      alt: typeof item.alt === "string" ? item.alt : "",
    }))
    .filter((item) => item.src.length > 0);
}

function parsePostInput(value: unknown): PostInput {
  if (!isRecord(value)) throw new Error(t("backendCommon.payloadInvalid", { noun: t("backendFields.post") }));
  if (typeof value.title !== "string") throw new Error(t("backendCommon.fieldRequired", { field: t("backendFields.title") }));
  if (typeof value.body !== "string") throw new Error(t("backendCommon.fieldRequired", { field: t("backendFields.body") }));
  return {
    title: value.title,
    body: value.body,
    contentWarning:
      value.contentWarning === null || typeof value.contentWarning === "string"
        ? (value.contentWarning as string | null)
        : undefined,
    altTexts: value.altTexts !== undefined ? parseAltTexts(value.altTexts) : undefined,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    status: value.status === "published" || value.status === "draft" ? value.status : undefined,
  };
}

export function registerPostsHandlers(): void {
  ipcMain.handle("posts:list", async () => {
    return postsStore.list();
  });

  ipcMain.handle("posts:get", async (_event, id: unknown) => {
    return postsStore.get(requireString(id, "backendFields.postId"));
  });

  ipcMain.handle("posts:create", async (_event, payload: unknown) => {
    try {
      return await postsStore.create(parsePostInput(payload));
    } catch (error) {
      logger.error("posts", `create failed: ${String(error)}`);
      throw error;
    }
  });

  ipcMain.handle("posts:update", async (_event, rawId: unknown, payload: unknown) => {
    const id = requireString(rawId, "backendFields.postId");
    try {
      if (!isRecord(payload)) throw new Error(t("backendCommon.payloadInvalid", { noun: t("backendFields.post") }));
      const input: Partial<PostInput> = {};
      if (typeof payload.title === "string") input.title = payload.title;
      if (typeof payload.body === "string") input.body = payload.body;
      if (payload.contentWarning === null || typeof payload.contentWarning === "string") {
        input.contentWarning = payload.contentWarning as string | null;
      }
      if (payload.altTexts !== undefined) input.altTexts = parseAltTexts(payload.altTexts);
      if (Array.isArray(payload.tags)) {
        input.tags = payload.tags.filter((tag): tag is string => typeof tag === "string");
      }
      if (payload.status === "published" || payload.status === "draft") {
        input.status = payload.status;
      }
      return await postsStore.update(id, input);
    } catch (error) {
      logger.error("posts", `update failed: ${String(error)}`);
      throw error;
    }
  });

  ipcMain.handle("posts:delete", async (_event, id: unknown) => {
    await postsStore.remove(requireString(id, "backendFields.postId"));
    return { ok: true };
  });
}
