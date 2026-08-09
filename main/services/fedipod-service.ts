import * as fs from "node:fs/promises";
import * as path from "node:path";

import { app, logger, safeStorage } from "@glaze/core/backend";

import type {
  FediPodConfig,
  FediPodStatus,
  FediverseVisibility,
  MastodonAccount,
  MastodonMediaAttachment,
  MastodonNotification,
  MastodonStatus,
  Post,
} from "../types.js";
import { DEFAULT_FEDIPOD_CONFIG } from "../types.js";
import { JsonStore } from "./json-store.js";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

/* ----------------------------- record helpers ---------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function bool(value: unknown): boolean {
  return value === true;
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/* ------------------------------- mappers ---------------------------------- */

function mapAccount(raw: unknown): MastodonAccount {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id),
    username: str(r.username),
    acct: str(r.acct),
    displayName: str(r.display_name) || str(r.username),
    url: str(r.url),
    avatar: str(r.avatar) || str(r.avatar_static),
    note: str(r.note),
    followersCount: num(r.followers_count),
    followingCount: num(r.following_count),
  };
}

function mapMedia(raw: unknown): MastodonMediaAttachment {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id),
    type: str(r.type, "unknown"),
    url: str(r.url) || str(r.remote_url) || str(r.preview_url),
    previewUrl: str(r.preview_url) || null,
    description: typeof r.description === "string" ? r.description : null,
  };
}

function mapStatus(raw: unknown, depth = 0): MastodonStatus {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id),
    uri: str(r.uri),
    url: str(r.url) || null,
    createdAt: str(r.created_at),
    content: str(r.content),
    spoilerText: str(r.spoiler_text),
    visibility: str(r.visibility, "public"),
    account: mapAccount(r.account),
    mediaAttachments: arr(r.media_attachments).map(mapMedia),
    favouritesCount: num(r.favourites_count),
    reblogsCount: num(r.reblogs_count),
    repliesCount: num(r.replies_count),
    favourited: bool(r.favourited),
    reblogged: bool(r.reblogged),
    inReplyToId: typeof r.in_reply_to_id === "string" ? r.in_reply_to_id : null,
    reblog: depth === 0 && isRecord(r.reblog) ? mapStatus(r.reblog, 1) : null,
  };
}

function mapNotification(raw: unknown): MastodonNotification {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id),
    type: str(r.type, "mention"),
    createdAt: str(r.created_at),
    account: mapAccount(r.account),
    status: isRecord(r.status) ? mapStatus(r.status) : null,
  };
}

/* ------------------------------- utilities -------------------------------- */

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("FediPod URL must start with http:// or https://");
  }
  return trimmed;
}

/** Convert a Markdown/HTML story body to a compact plaintext excerpt. */
function toPlainText(body: string, max = 360): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[#>*_~-]+\s?/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}

function httpImageSources(post: Post): Array<{ src: string; alt: string }> {
  const out: Array<{ src: string; alt: string }> = [];
  const seen = new Set<string>();
  const push = (src: string) => {
    if (!/^https?:\/\//i.test(src) || seen.has(src)) return;
    seen.add(src);
    const alt = post.altTexts.find((entry) => entry.src === src)?.alt ?? "";
    out.push({ src, alt });
  };
  const md = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const html = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = md.exec(post.body)) !== null) push(m[1]);
  while ((m = html.exec(post.body)) !== null) push(m[1]);
  return out.slice(0, 4);
}

/* ------------------------------- service ---------------------------------- */

class FediPodService {
  private readonly config = new JsonStore<FediPodConfig>(
    "fedipod-config.json",
    () => ({ ...DEFAULT_FEDIPOD_CONFIG }),
    (value) => {
      if (!isRecord(value)) return { ...DEFAULT_FEDIPOD_CONFIG };
      return {
        version: 1,
        baseUrl: str(value.baseUrl),
        account: isRecord(value.account) ? mapAccount(value.account) : null,
      };
    },
  );

  private tokenPath: string | null = null;
  private cachedToken: string | null = null;

  private async resolveTokenPath(): Promise<string> {
    if (!this.tokenPath) {
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      this.tokenPath = path.join(dir, "fedipod-token.bin");
    }
    return this.tokenPath;
  }

  private async readToken(): Promise<string | null> {
    if (this.cachedToken) return this.cachedToken;
    try {
      const encrypted = await fs.readFile(await this.resolveTokenPath());
      this.cachedToken = await safeStorage.decryptString(encrypted);
      return this.cachedToken;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return null;
      }
      logger.warn("fedipod", `Failed to read token: ${String(error)}`);
      return null;
    }
  }

  private async writeToken(token: string): Promise<void> {
    const encrypted = await safeStorage.encryptString(token);
    await fs.writeFile(await this.resolveTokenPath(), encrypted);
    this.cachedToken = token;
  }

  private async clearToken(): Promise<void> {
    this.cachedToken = null;
    await fs.rm(await this.resolveTokenPath(), { force: true });
  }

  /** Low-level authorized request against the Mastodon client API. */
  private async request(
    baseUrl: string,
    token: string,
    apiPath: string,
    init: FetchInit = {},
  ): Promise<unknown> {
    const url = `${baseUrl}${apiPath}`;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (error) {
      throw new Error(
        `Could not reach FediPod at ${baseUrl}. Is it running? (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let detail = text.slice(0, 240);
      try {
        const parsed: unknown = JSON.parse(text);
        if (isRecord(parsed) && typeof parsed.error === "string") detail = parsed.error;
      } catch {
        /* keep raw text */
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("FediPod rejected the access token. Reconnect in the You tab.");
      }
      throw new Error(`FediPod request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  private async authed(apiPath: string, init: FetchInit = {}): Promise<unknown> {
    const config = await this.config.load();
    const token = await this.readToken();
    if (!config.baseUrl || !token) {
      throw new Error("FediPod is not connected. Connect it in the You tab.");
    }
    return this.request(config.baseUrl, token, apiPath, init);
  }

  /* --------------------------------- auth -------------------------------- */

  async connect(baseUrlInput: string, tokenInput: string): Promise<MastodonAccount> {
    const baseUrl = normalizeBaseUrl(baseUrlInput);
    const token = tokenInput.trim();
    if (!token) throw new Error("An access token is required to connect to FediPod.");

    const raw = await this.request(baseUrl, token, "/api/v1/accounts/verify_credentials");
    const account = mapAccount(raw);
    if (!account.id) {
      throw new Error("FediPod did not return an account for this token.");
    }
    await this.writeToken(token);
    await this.config.save({ version: 1, baseUrl, account });
    logger.info("fedipod", `Connected to ${baseUrl} as @${account.acct || account.username}`);
    return account;
  }

  async disconnect(): Promise<void> {
    await this.clearToken();
    await this.config.save({ ...DEFAULT_FEDIPOD_CONFIG });
    logger.info("fedipod", "Disconnected");
  }

  async getStatus(): Promise<FediPodStatus> {
    const config = await this.config.load();
    const token = await this.readToken();
    const connected = Boolean(config.baseUrl && token);
    return {
      connected,
      baseUrl: config.baseUrl,
      account: connected ? config.account : null,
    };
  }

  async verifyCredentials(): Promise<MastodonAccount> {
    const account = mapAccount(await this.authed("/api/v1/accounts/verify_credentials"));
    await this.config.update((current) => ({ ...current, account }));
    return account;
  }

  async isConnected(): Promise<boolean> {
    return (await this.getStatus()).connected;
  }

  /* -------------------------------- reads -------------------------------- */

  async fetchHomeTimeline(
    options: { maxId?: string; limit?: number } = {},
  ): Promise<MastodonStatus[]> {
    const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
    if (options.maxId) params.set("max_id", options.maxId);
    const raw = await this.authed(`/api/v1/timelines/home?${params.toString()}`);
    return arr(raw).map((item) => mapStatus(item));
  }

  async fetchNotifications(options: { limit?: number } = {}): Promise<MastodonNotification[]> {
    const params = new URLSearchParams({ limit: String(options.limit ?? 30) });
    const raw = await this.authed(`/api/v1/notifications?${params.toString()}`);
    return arr(raw).map(mapNotification);
  }

  /* ------------------------------- actions ------------------------------- */

  async postStatus(input: {
    status: string;
    spoilerText?: string | null;
    visibility?: FediverseVisibility;
    inReplyToId?: string | null;
    mediaIds?: string[];
  }): Promise<MastodonStatus> {
    const body: Record<string, unknown> = {
      status: input.status,
      visibility: input.visibility ?? "public",
    };
    if (input.spoilerText) body.spoiler_text = input.spoilerText;
    if (input.inReplyToId) body.in_reply_to_id = input.inReplyToId;
    if (input.mediaIds && input.mediaIds.length > 0) body.media_ids = input.mediaIds;
    const raw = await this.authed("/api/v1/statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return mapStatus(raw);
  }

  async setFavourite(id: string, active: boolean): Promise<MastodonStatus> {
    const raw = await this.authed(
      `/api/v1/statuses/${encodeURIComponent(id)}/${active ? "favourite" : "unfavourite"}`,
      { method: "POST" },
    );
    return mapStatus(raw);
  }

  async setBoost(id: string, active: boolean): Promise<MastodonStatus> {
    const raw = await this.authed(
      `/api/v1/statuses/${encodeURIComponent(id)}/${active ? "reblog" : "unreblog"}`,
      { method: "POST" },
    );
    const mapped = mapStatus(raw);
    // reblog returns a wrapper whose `reblog` is the boosted status.
    return mapped.reblog ?? mapped;
  }

  async setFollow(id: string, active: boolean): Promise<{ following: boolean }> {
    const raw = await this.authed(
      `/api/v1/accounts/${encodeURIComponent(id)}/${active ? "follow" : "unfollow"}`,
      { method: "POST" },
    );
    const r = isRecord(raw) ? raw : {};
    return { following: bool(r.following) };
  }

  /** Fetch a remote image and upload it as a media attachment with alt text. */
  private async uploadMedia(src: string, description: string): Promise<string | null> {
    try {
      const imageResponse = await fetch(src);
      if (!imageResponse.ok) return null;
      const blob = await imageResponse.blob();
      const form = new FormData();
      const name = src.split("/").pop()?.split("?")[0] || "image";
      form.append("file", blob, name);
      if (description) form.append("description", description);
      const raw = await this.authed("/api/v2/media", { method: "POST", body: form });
      const r = isRecord(raw) ? raw : {};
      return str(r.id) || null;
    } catch (error) {
      logger.warn("fedipod", `Media upload skipped for ${src}: ${String(error)}`);
      return null;
    }
  }

  /** Share an Ailo story to the Fediverse, carrying CW + image alt text. */
  async crossPostStory(
    post: Post,
    visibility: FediverseVisibility = "public",
  ): Promise<{ id: string; url: string | null }> {
    const excerpt = toPlainText(post.body);
    const link = post.solidUrl ?? "";
    const hashtags = post.tags
      .map((tag) => `#${tag.replace(/[^a-z0-9]+/gi, "")}`)
      .filter((tag) => tag.length > 1)
      .join(" ");

    const parts = [post.title.trim(), excerpt, link, hashtags].filter(Boolean);
    let statusText = parts.join("\n\n");
    if (statusText.length > 480) statusText = `${statusText.slice(0, 479).trimEnd()}…`;

    const mediaIds: string[] = [];
    for (const image of httpImageSources(post)) {
      const id = await this.uploadMedia(image.src, image.alt);
      if (id) mediaIds.push(id);
    }

    const status = await this.postStatus({
      status: statusText,
      spoilerText: post.contentWarning,
      visibility,
      mediaIds,
    });
    return { id: status.id, url: status.url };
  }
}

export const fediPodService = new FediPodService();
