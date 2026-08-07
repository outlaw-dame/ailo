import { randomUUID } from "node:crypto";

import type { ImageAltText, Post, PostsFile } from "../types.js";
import { JsonStore } from "./json-store.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAltTexts(value: unknown): ImageAltText[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      src: typeof item.src === "string" ? item.src : "",
      alt: typeof item.alt === "string" ? item.alt : "",
    }))
    .filter((item) => item.src.length > 0);
}

function normalizePost(value: unknown): Post | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.body !== "string") {
    return null;
  }
  const status = value.status === "published" ? "published" : "draft";
  return {
    id: value.id,
    title: value.title,
    body: value.body,
    contentWarning: typeof value.contentWarning === "string" ? value.contentWarning : null,
    altTexts: normalizeAltTexts(value.altTexts),
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    solidUrl: typeof value.solidUrl === "string" ? value.solidUrl : null,
    githubPath: typeof value.githubPath === "string" ? value.githubPath : null,
    status,
  };
}

function validatePostsFile(value: unknown): PostsFile {
  if (!isRecord(value)) throw new Error("posts.json must contain an object");
  const posts = Array.isArray(value.posts)
    ? value.posts.map(normalizePost).filter((post): post is Post => post !== null)
    : [];
  return { version: 1, posts };
}

export interface PostInput {
  title: string;
  body: string;
  contentWarning?: string | null;
  altTexts?: ImageAltText[];
  tags?: string[];
  status?: "draft" | "published";
}

class PostsStore {
  private readonly store = new JsonStore<PostsFile>(
    "posts.json",
    () => ({ version: 1, posts: [] }),
    validatePostsFile,
  );

  async list(): Promise<Post[]> {
    const file = await this.store.load();
    return [...file.posts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Post | null> {
    const file = await this.store.load();
    return file.posts.find((post) => post.id === id) ?? null;
  }

  async create(input: PostInput): Promise<Post> {
    const now = new Date().toISOString();
    const post: Post = {
      id: randomUUID(),
      title: input.title.trim() || "Untitled",
      body: input.body,
      contentWarning: input.contentWarning?.trim() ? input.contentWarning.trim() : null,
      altTexts: input.altTexts ?? [],
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      publishedAt: input.status === "published" ? now : null,
      solidUrl: null,
      githubPath: null,
      status: input.status ?? "draft",
    };
    await this.store.update((file) => ({ ...file, posts: [post, ...file.posts] }));
    return post;
  }

  async update(id: string, input: Partial<PostInput>): Promise<Post> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Post not found: ${id}`);
    const now = new Date().toISOString();
    const nextStatus = input.status ?? existing.status;
    const updated: Post = {
      ...existing,
      title: input.title !== undefined ? input.title.trim() || "Untitled" : existing.title,
      body: input.body !== undefined ? input.body : existing.body,
      contentWarning:
        input.contentWarning !== undefined
          ? input.contentWarning?.trim()
            ? input.contentWarning.trim()
            : null
          : existing.contentWarning,
      altTexts: input.altTexts !== undefined ? input.altTexts : existing.altTexts,
      tags: input.tags !== undefined ? input.tags : existing.tags,
      status: nextStatus,
      updatedAt: now,
      publishedAt:
        nextStatus === "published"
          ? existing.publishedAt ?? now
          : existing.publishedAt,
    };
    await this.store.update((file) => ({
      ...file,
      posts: file.posts.map((post) => (post.id === id ? updated : post)),
    }));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.store.update((file) => ({
      ...file,
      posts: file.posts.filter((post) => post.id !== id),
    }));
  }

  async markPublished(
    id: string,
    targets: { solidUrl?: string | null; githubPath?: string | null },
  ): Promise<Post> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Post not found: ${id}`);
    const now = new Date().toISOString();
    const updated: Post = {
      ...existing,
      status: "published",
      publishedAt: existing.publishedAt ?? now,
      updatedAt: now,
      solidUrl: targets.solidUrl !== undefined ? targets.solidUrl : existing.solidUrl,
      githubPath: targets.githubPath !== undefined ? targets.githubPath : existing.githubPath,
    };
    await this.store.update((file) => ({
      ...file,
      posts: file.posts.map((post) => (post.id === id ? updated : post)),
    }));
    return updated;
  }
}

export const postsStore = new PostsStore();
