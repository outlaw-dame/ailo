import * as fs from "node:fs/promises";
import * as path from "node:path";

import { app, logger, safeStorage } from "@glaze/core/backend";

import type {
  FediPodConfig,
  FediPodCapabilities,
  FediPodLoginResult,
  FediPodStatus,
  FediverseVisibility,
  FediverseContentType,
  FediverseObjectType,
  MastodonAccount,
  MastodonMediaAttachment,
  MastodonNotification,
  MastodonStatus,
  Post,
} from "../types.js";
import { DEFAULT_FEDIPOD_CONFIG } from "../types.js";
import {
  normalizeCommunityHandle,
  requireExactGroup,
} from "./fedipod-groups.js";
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
const OBJECT_TYPES: FediverseObjectType[] = ["Note", "Article"];
const CONTENT_TYPES: FediverseContentType[] = [
  "text/plain",
  "text/markdown",
  "text/x.misskeymarkdown",
];
function objectType(value: unknown): FediverseObjectType {
  return OBJECT_TYPES.includes(value as FediverseObjectType) ? (value as FediverseObjectType) : "Note";
}
function contentType(value: unknown): FediverseContentType {
  return CONTENT_TYPES.includes(value as FediverseContentType)
    ? (value as FediverseContentType)
    : "text/plain";
}

/* ------------------------------- mappers ---------------------------------- */

function mapAccount(raw: unknown): MastodonAccount {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id),
    username: str(r.username),
    acct: str(r.acct),
    displayName: str(r.display_name) || str(r.displayName) || str(r.username),
    url: str(r.url),
    avatar: str(r.avatar) || str(r.avatar_static),
    note: str(r.note),
    followersCount: num(r.followers_count, num(r.followersCount)),
    followingCount: num(r.following_count, num(r.followingCount)),
    group: bool(r.group),
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
  const sourceRaw = isRecord(r.source) ? r.source : null;
  const mappedContentType = contentType(r.content_type ?? sourceRaw?.mediaType);
  return {
    id: str(r.id),
    uri: str(r.uri),
    url: str(r.url) || null,
    createdAt: str(r.created_at),
    content: str(r.content),
    objectType: objectType(r.object_type),
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : null,
    contentType: mappedContentType,
    source:
      sourceRaw && typeof sourceRaw.content === "string"
        ? { content: sourceRaw.content, mediaType: contentType(sourceRaw.mediaType) }
        : null,
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

  /**
   * One-click OAuth login: hits FediPod's `/oauth/authorize` the same way
   * Phanpy/Tuba/Whalebird do when you add the agent as a custom instance.
   * With no UI password set, FediPod treats a loopback request as trusted and
   * auto-approves, handing back a code that IS the access token (FediPod's
   * `/oauth/token` just echoes it). With a password set, it renders an HTML
   * login form instead of JSON — we surface that as `password_required` so
   * the caller can prompt and retry with the password.
   */
  async loginWithOneClick(baseUrlInput: string, password?: string): Promise<FediPodLoginResult> {
    const baseUrl = normalizeBaseUrl(baseUrlInput);
    const authorizeUrl = new URL(`${baseUrl}/oauth/authorize`);
    authorizeUrl.searchParams.set("redirect_uri", "urn:ietf:wg:oauth:2.0:oob");

    let response: Response;
    try {
      response = password
        ? await fetch(authorizeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ redirect_uri: "urn:ietf:wg:oauth:2.0:oob", password }),
          })
        : await fetch(authorizeUrl);
    } catch (error) {
      throw new Error(
        `Could not reach FediPod at ${baseUrl}. Is it running? (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      // FediPod renders its login form as HTML instead of returning JSON
      // when a UI password is required (200 = "enter it", 401 = "wrong one").
      if (response.status === 401) {
        const html = await response.text().catch(() => "");
        const message = /class="err"[^>]*>([^<]*)</.exec(html)?.[1];
        throw new Error(message || "FediPod rejected that password.");
      }
      return { status: "password_required" };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error(
        `FediPod returned an unexpected response (${response.status}) from /oauth/authorize.`,
      );
    }
    if (!response.ok) {
      const message =
        isRecord(body) && typeof body.error === "string"
          ? body.error
          : `FediPod login failed (${response.status})`;
      throw new Error(message);
    }

    const code = isRecord(body) && typeof body.code === "string" ? body.code : "";
    if (!code) throw new Error("FediPod did not return an authorization code.");

    const account = await this.connect(baseUrl, code);
    return { status: "connected", account };
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

  async fetchCapabilities(): Promise<FediPodCapabilities> {
    const raw = await this.authed("/api/v2/instance");
    const config = isRecord(raw) && isRecord(raw.configuration) ? raw.configuration : {};
    const statuses = isRecord(config.statuses) ? config.statuses : {};
    return {
      objectTypes: arr(statuses.supported_object_types).filter(
        (value): value is FediverseObjectType => OBJECT_TYPES.includes(value as FediverseObjectType),
      ),
      contentTypes: arr(statuses.supported_content_types).filter(
        (value): value is FediverseContentType => CONTENT_TYPES.includes(value as FediverseContentType),
      ),
      maxTitleCharacters: Math.min(300, Math.max(1, num(statuses.max_title_characters, 300))),
      supportsCommunityTargeting: bool(statuses.community_targeting),
    };
  }

  async resolveCommunity(handleInput: string): Promise<MastodonAccount> {
    const handle = normalizeCommunityHandle(handleInput);
    const params = new URLSearchParams({ q: handle, limit: "20" });
    const raw = await this.authed(`/api/v1/accounts/search?${params.toString()}`);
    const accounts = arr(raw).map(mapAccount);
    return requireExactGroup(accounts, handle);
  }

  /* ------------------------------- actions ------------------------------- */

  async postStatus(input: {
    status: string;
    spoilerText?: string | null;
    visibility?: FediverseVisibility;
    inReplyToId?: string | null;
    mediaIds?: string[];
    community?: string | null;
    objectType?: FediverseObjectType;
    title?: string | null;
    contentType?: FediverseContentType;
  }): Promise<MastodonStatus> {
    const status = input.status.trim();
    let community: MastodonAccount | null = null;
    if (input.community) {
      if ((input.visibility ?? "public") !== "public") {
        throw new Error("Community posts must be public so the group can distribute them.");
      }
      community = await this.resolveCommunity(input.community);
    }
    const body: Record<string, unknown> = {
      status,
      visibility: input.visibility ?? "public",
      object_type: input.objectType ?? "Note",
      content_type: input.contentType ?? "text/plain",
    };
    if (input.title) body.title = input.title.trim();
    if (community) body.community = community.acct;
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
    const capabilities = await this.fetchCapabilities();
    if (!capabilities.objectTypes.includes("Article") || !capabilities.contentTypes.includes("text/markdown")) {
      throw new Error("This FediPod does not advertise ActivityPub Article with Markdown support.");
    }
    const link = post.solidUrl ? `\n\n[Original story](${post.solidUrl})` : "";
    const hashtags = post.tags
      .map((tag) => `#${tag.replace(/[^a-z0-9]+/gi, "")}`)
      .filter((tag) => tag.length > 1)
      .join(" ");
    const statusText = `${post.body.trim()}${link}${hashtags ? `\n\n${hashtags}` : ""}`;

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
      objectType: "Article",
      title: post.title.trim(),
      contentType: "text/markdown",
    });
    return { id: status.id, url: status.url };
  }
}

export const fediPodService = new FediPodService();
