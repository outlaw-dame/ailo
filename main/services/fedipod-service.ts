import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

import { app, logger, safeStorage } from "@glaze/core/backend";

import type {
  AiAssistantAction,
  AiAssistantMessage,
  AiFilterMatch,
  AiFilterMatchDocument,
  AiFilterMatchQuery,
  AiModerationSuggestions,
  AiProvider,
  AiStatus,
  ProviderCredential,
  ProviderCredentialsStatus,
  ProviderCredentialState,
  ProviderCredentialTestResult,
  FediPodConfig,
  FediPodCapabilities,
  FediPodLoginResult,
  FediPodStatus,
  CustomFeed,
  CustomFeedInput,
  FediverseVisibility,
  FediverseContentType,
  FediverseObjectType,
  MastodonAccount,
  MastodonCollection,
  MastodonCollectionImportResult,
  MastodonCollectionSource,
  MastodonCollectionSourcePreview,
  MastodonCreatorAttribution,
  MastodonMediaAttachment,
  MastodonList,
  MastodonFilter,
  MastodonFilterResult,
  FilterInput,
  ModerationStatsBundle,
  ModerationDomainBreakdown,
  MastodonFeaturedTag,
  MastodonNotification,
  MastodonRelationship,
  MastodonStatus,
  MastodonSuggestion,
  MastodonQuotePolicy,
  MastodonTag,
  KlipyGif,
  Post,
  SafeBrowsingResult,
  TranslationProvider,
  TranslationSettings,
} from "../types.js";
import { DEFAULT_FEDIPOD_CONFIG } from "../types.js";
import {
  normalizeCommunityHandle,
  requireExactGroup,
} from "./fedipod-groups.js";
import { JsonStore } from "./json-store.js";
import { recordModerationAction, weeklyStats as localWeeklyModerationStats } from "./moderation-stats.js";
import { mapFeaturedTag, mapTag } from "./fedipod-tags.js";
import {
  mapCollection,
  mapCollectionImport,
  mapCollectionSource,
  mapCollectionSourcePreview,
  mapQuoteMetadata,
} from "./fedipod-modern.js";
import {
  mapAiStatus,
  mapAssistantReply,
  mapFilterMatches,
  mapHashtagSuggestions,
  mapModerationSuggestions,
  mapProviderCredentials,
  mapSafeBrowsingResult,
  mapTranslation,
  mapTranslationSettings,
} from "./fedipod-ai.js";
import { mapCreatorAttribution, mapCreatorCard } from "./fedipod-creator.js";
import { mapMediaAttachment } from "./fedipod-media.js";
import {
  AILO_FEDIPOD_API_VERSION,
  parseFediPodCompatibility,
} from "./fedipod-compatibility.js";
import { resolveLocalFediPodBase } from "./fedipod-local-route.js";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

type LocalPairingResult =
  | { status: "unavailable" }
  | { status: "password_required" }
  | { status: "paired"; gateToken: string };

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

export function mapAccount(raw: unknown): MastodonAccount {
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

// The wire shape lib/mastoapi.mjs's keywordsOf() expects — a fresh array
// every time, since a PUT replaces the filter's whole keyword list rather
// than patching individual rows (see updateFilter's own comment).
function keywordsAttributes(keywords: FilterInput["keywords"]) {
  return keywords.map((k) => ({
    keyword: k.keyword.trim(),
    whole_word: k.wholeWord ?? false,
    semantic: k.semantic ?? true,
    semantic_threshold: k.semanticThreshold ?? 0.6,
    semantic_model: k.semanticModel ?? "embeddinggemma-300m",
  }));
}

function mapFilter(raw: unknown): MastodonFilter {
  const r = isRecord(raw) ? raw : {};
  const action = str(r.filter_action, "warn");
  return {
    id: str(r.id),
    title: str(r.title),
    context: arr(r.context).map((value) => str(value)).filter(Boolean),
    expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
    action: action === "hide" || action === "blur" ? action : "warn",
    keywords: arr(r.keywords).map((value) => {
      const keyword = isRecord(value) ? value : {};
      return {
        id: str(keyword.id),
        keyword: str(keyword.keyword),
        wholeWord: bool(keyword.whole_word),
        semantic: bool(keyword.semantic),
        semanticThreshold: typeof keyword.semantic_threshold === "number"
          ? keyword.semantic_threshold : null,
        semanticModel: typeof keyword.semantic_model === "string"
          ? keyword.semantic_model : null,
      };
    }),
  };
}

function mapFilterResult(raw: unknown): MastodonFilterResult | null {
  const r = isRecord(raw) ? raw : {};
  if (!isRecord(r.filter)) return null;
  return {
    filter: mapFilter(r.filter),
    keywordMatches: arr(r.keyword_matches).map((value) => str(value)).filter(Boolean),
  };
}

function mapRelationship(raw: unknown): MastodonRelationship {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id),
    blocking: bool(r.blocking),
    muting: bool(r.muting),
    mutingNotifications: bool(r.muting_notifications),
  };
}

function mapList(raw: unknown): MastodonList {
  const r = isRecord(raw) ? raw : {};
  return { id: str(r.id), title: str(r.title) };
}

function mapCustomFeed(raw: unknown): CustomFeed {
  const r = isRecord(raw) ? raw : {};
  const strings = (value: unknown) => arr(value).map((item) => str(item)).filter(Boolean);
  return {
    id: str(r.id), name: str(r.name), description: str(r.description),
    avatarUrl: str(r.avatar_url) || null, bannerUrl: str(r.banner_url) || null,
    accounts: strings(r.accounts), hashtags: strings(r.hashtags),
    semanticKeywords: strings(r.semantic_keywords), excludeWords: strings(r.exclude_words),
    excludeAccounts: strings(r.exclude_accounts), createdAt: str(r.created_at), updatedAt: str(r.updated_at),
  };
}

export function mapStatus(raw: unknown, depth = 0): MastodonStatus {
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
    filtered: arr(r.filtered)
      .map(mapFilterResult)
      .filter((value): value is MastodonFilterResult => value !== null),
    spoilerText: str(r.spoiler_text),
    language: typeof r.language === "string" && r.language.trim() ? r.language.trim() : null,
    sensitive: bool(r.sensitive),
    visibility: str(r.visibility, "public"),
    account: mapAccount(r.account),
    mediaAttachments: arr(r.media_attachments).map(mapMediaAttachment),
    card: isRecord(r.card) ? mapCreatorCard(r.card, mapAccount) : null,
    favouritesCount: num(r.favourites_count),
    reblogsCount: num(r.reblogs_count),
    repliesCount: num(r.replies_count),
    favourited: bool(r.favourited),
    reblogged: bool(r.reblogged),
    pinned: bool(r.pinned),
    inReplyToId: typeof r.in_reply_to_id === "string" ? r.in_reply_to_id : null,
    reblog: depth === 0 && isRecord(r.reblog) ? mapStatus(r.reblog, 1) : null,
    ...mapQuoteMetadata(r, (quoted) => depth === 0 && isRecord(quoted) ? mapStatus(quoted, 1) : null),
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
    collection: isRecord(r.collection) ? mapCollection(r.collection) : null,
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
  private gateTokenPath: string | null = null;
  private cachedGateToken: string | null = null;

  private async resolveTokenPath(): Promise<string> {
    if (!this.tokenPath) {
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      this.tokenPath = path.join(dir, "fedipod-token.bin");
    }
    return this.tokenPath;
  }

  private async resolveGateTokenPath(): Promise<string> {
    if (!this.gateTokenPath) {
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      this.gateTokenPath = path.join(dir, "fedipod-gate-token.bin");
    }
    return this.gateTokenPath;
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

  private async readGateToken(): Promise<string | null> {
    if (this.cachedGateToken) return this.cachedGateToken;
    try {
      const encrypted = await fs.readFile(await this.resolveGateTokenPath());
      this.cachedGateToken = await safeStorage.decryptString(encrypted);
      return this.cachedGateToken;
    } catch (error) {
      if (error instanceof Error && "code" in error
        && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      logger.warn("fedipod", `Failed to read tunnel gate token: ${String(error)}`);
      return null;
    }
  }

  private async writeGateToken(token: string): Promise<void> {
    const file = await this.resolveGateTokenPath();
    if (!token) {
      this.cachedGateToken = null;
      await fs.rm(file, { force: true });
      return;
    }
    const encrypted = await safeStorage.encryptString(token);
    await fs.writeFile(file, encrypted, { mode: 0o600 });
    await fs.chmod(file, 0o600);
    this.cachedGateToken = token;
  }

  /** Pair with a same-machine FediPod without ever exposing its gate token to the UI. */
  private async pairWithLocalFediPod(baseUrl: string, password?: string): Promise<LocalPairingResult> {
    const desiredHost = new URL(baseUrl).host.toLowerCase();
    const endpoint = "http://127.0.0.1:8030/admin/ailo-pair";
    let availability: unknown;
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return { status: "unavailable" };
      availability = await response.json();
    } catch {
      return { status: "unavailable" };
    }
    if (!isRecord(availability)
      || availability.ready !== true
      || !Array.isArray(availability.allowedHosts)
      || !availability.allowedHosts.every((host) => typeof host === "string")
      || !availability.allowedHosts.includes(desiredHost)) return { status: "unavailable" };
    if (!password) return { status: "password_required" };

    const keys = crypto.generateKeyPairSync("x25519");
    const clientPublicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
    let response: Response;
    let paired: unknown;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password, clientPublicKey }), signal: AbortSignal.timeout(5_000),
      });
      paired = await response.json();
    } catch (error) {
      throw new Error(`Could not complete local FediPod pairing: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status === 401) throw new Error("FediPod rejected that password.");
    if (!response.ok || !isRecord(paired)) throw new Error(`Could not complete local FediPod pairing (${response.status}).`);
    const fields = ["serverPublicKey", "iv", "ciphertext", "tag"] as const;
    if (!fields.every((field) => typeof paired[field] === "string" && paired[field].length <= 2_048)) {
      throw new Error("FediPod returned an invalid local pairing response.");
    }
    const payload = paired as Record<(typeof fields)[number], string>;
    try {
      const serverPublicKey = crypto.createPublicKey({
        key: Buffer.from(payload.serverPublicKey, "base64"), format: "der", type: "spki",
      });
      if (serverPublicKey.asymmetricKeyType !== "x25519") throw new Error("unexpected key type");
      const shared = crypto.diffieHellman({ privateKey: keys.privateKey, publicKey: serverPublicKey });
      const key = crypto.createHash("sha256").update("FediPod Ailo pairing v1\0").update(shared).digest();
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      const gateToken = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final(),
      ]).toString("utf8");
      if (!gateToken || gateToken.length > 1_024
        || Array.from(gateToken).some((character) =>
          character.charCodeAt(0) <= 0x20 || character.charCodeAt(0) === 0x7f)) {
        throw new Error("invalid token");
      }
      return { status: "paired", gateToken };
    } catch {
      throw new Error("Could not verify FediPod's local pairing response.");
    }
  }

  private async clearToken(): Promise<void> {
    this.cachedToken = null;
    await fs.rm(await this.resolveTokenPath(), { force: true });
    await this.writeGateToken("");
  }

  private async expireAccessToken(): Promise<void> {
    const config = await this.config.load();
    this.cachedToken = null;
    await fs.rm(await this.resolveTokenPath(), { force: true });
    await this.config.save({ version: 1, baseUrl: config.baseUrl, account: null });
    logger.warn("fedipod", "Expired rejected access token; reconnect is required");
  }

  /** Low-level authorized request against the Mastodon client API. */
  private async request(
    baseUrl: string,
    token: string,
    apiPath: string,
    init: FetchInit = {},
    gateToken?: string | null,
  ): Promise<unknown> {
    // Ailo and FediPod normally share this machine. Prefer the verified
    // loopback daemon so local actions do not depend on a Cloudflare tunnel;
    // fall back to the configured public endpoint when FediPod is remote.
    const requestBase = await resolveLocalFediPodBase(baseUrl, gateToken);
    const url = `${requestBase || baseUrl}${apiPath}`;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Ailo-API-Version", String(AILO_FEDIPOD_API_VERSION));
    if (gateToken) headers.set("x-dk-token", gateToken);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, redirect: "manual" });
    } catch (error) {
      throw new Error(
        `Could not reach FediPod at ${requestBase || baseUrl}. Is it running? (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new Error("FediPod redirected an authenticated API request. Configure Ailo with the final HTTPS endpoint, then reconnect.");
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
      if ((response.status === 401 || response.status === 403)
        && /unauthorized|forbidden/i.test(text) && !/access token/i.test(text)) {
        throw new Error("FediPod rejected the tunnel access token.");
      }
      if (response.status === 401 || response.status === 403) {
        const error = new Error("FediPod session expired. Reconnect in the You tab.");
        error.name = "FediPodAccessTokenError";
        throw error;
      }
      throw new Error(`FediPod request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  private async authed(apiPath: string, init: FetchInit = {}): Promise<unknown> {
    const config = await this.config.load();
    const token = await this.readToken();
    const gateToken = await this.readGateToken();
    if (!config.baseUrl || !token) {
      throw new Error("FediPod is not connected. Connect it in the You tab.");
    }
    try {
      return await this.request(config.baseUrl, token, apiPath, init, gateToken);
    } catch (error) {
      if (error instanceof Error && error.name === "FediPodAccessTokenError") await this.expireAccessToken();
      throw error;
    }
  }

  /* --------------------------------- auth -------------------------------- */

  async connect(baseUrlInput: string, tokenInput: string, gateTokenInput?: string): Promise<MastodonAccount> {
    const baseUrl = normalizeBaseUrl(baseUrlInput);
    const token = tokenInput.trim();
    if (!token) throw new Error("An access token is required to connect to FediPod.");

    const gateToken = gateTokenInput?.trim() || "";
    const raw = await this.request(baseUrl, token, "/api/v1/accounts/verify_credentials", {}, gateToken);
    const account = mapAccount(raw);
    if (!account.id) {
      throw new Error("FediPod did not return an account for this token.");
    }
    parseFediPodCompatibility(
      await this.request(baseUrl, token, "/api/v2/instance", {}, gateToken),
    );
    await this.writeToken(token);
    await this.writeGateToken(gateToken);
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
  async loginWithOneClick(
    baseUrlInput: string,
    password?: string,
    gateTokenInput?: string,
  ): Promise<FediPodLoginResult> {
    const baseUrl = normalizeBaseUrl(baseUrlInput);
    const authorizeUrl = new URL(`${baseUrl}/oauth/authorize`);
    authorizeUrl.searchParams.set("redirect_uri", "urn:ietf:wg:oauth:2.0:oob");
    let gateToken = gateTokenInput?.trim() || "";
    if (!gateToken) {
      const pairing = await this.pairWithLocalFediPod(baseUrl, password);
      if (pairing.status === "password_required") return { status: "password_required" };
      if (pairing.status === "paired") gateToken = pairing.gateToken;
    }

    let response: Response;
    try {
      response = password
        ? await fetch(authorizeUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...(gateToken ? { "x-dk-token": gateToken } : {}),
            },
            body: new URLSearchParams({ redirect_uri: "urn:ietf:wg:oauth:2.0:oob", password }),
          })
        : await fetch(authorizeUrl, {
            headers: gateToken ? { "x-dk-token": gateToken } : undefined,
          });
    } catch (error) {
      throw new Error(
        `Could not reach FediPod at ${baseUrl}. Is it running? (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if ((response.status === 401 || response.status === 403)
      && !contentType.includes("text/html") && !contentType.includes("application/json")) {
      throw new Error("FediPod rejected the tunnel access token.");
    }
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

    const account = await this.connect(baseUrl, code, gateToken);
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

  /** Handle to credit as content creator (fediverse:creator) when publishing, if connected. */
  async creatorHandle(): Promise<string | null> {
    const status = await this.getStatus();
    if (!status.connected || !status.account) return null;
    return status.account.acct || status.account.username || null;
  }

  async fetchCreatorAttribution(): Promise<MastodonCreatorAttribution> {
    return mapCreatorAttribution(await this.authed("/api/v1/accounts/verify_credentials"), mapAccount);
  }

  async updateCreatorAttribution(domains: string[]): Promise<MastodonCreatorAttribution> {
    const raw = await this.authed("/api/v1/accounts/update_credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attribution_domains: domains }),
    });
    const result = mapCreatorAttribution(raw, mapAccount);
    await this.config.update((current) => ({ ...current, account: result.account }));
    return result;
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

  async fetchTagTimeline(
    tag: string,
    options: { maxId?: string; limit?: number } = {},
  ): Promise<MastodonStatus[]> {
    const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
    if (options.maxId) params.set("max_id", options.maxId);
    const raw = await this.authed(
      `/api/v1/timelines/tag/${encodeURIComponent(tag)}?${params.toString()}`,
    );
    return arr(raw).map((item) => mapStatus(item));
  }

  async fetchNotifications(options: { limit?: number } = {}): Promise<MastodonNotification[]> {
    const params = new URLSearchParams({ limit: String(options.limit ?? 30) });
    const raw = await this.authed(`/api/v1/notifications?${params.toString()}`);
    return arr(raw).map(mapNotification);
  }

  async fetchBlockedAccounts(): Promise<MastodonAccount[]> {
    return arr(await this.authed("/api/v1/blocks")).map(mapAccount);
  }

  async fetchMutedAccounts(): Promise<MastodonAccount[]> {
    return arr(await this.authed("/api/v1/mutes")).map(mapAccount);
  }

  async fetchDomainBlocks(): Promise<string[]> {
    return arr(await this.authed("/api/v1/domain_blocks")).map((item) => str(item)).filter(Boolean);
  }

  async setDomainBlock(domain: string, active: boolean): Promise<void> {
    await this.authed(`/api/v1/domain_blocks?${new URLSearchParams({ domain })}`, {
      method: active ? "POST" : "DELETE",
    });
    if (active) await recordModerationAction("domain-block");
  }

  async fetchLists(): Promise<MastodonList[]> {
    return arr(await this.authed("/api/v1/lists")).map(mapList).filter((list) => list.id);
  }

  async createList(title: string): Promise<MastodonList> {
    return mapList(await this.authed("/api/v1/lists", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
    }));
  }

  async deleteList(id: string): Promise<void> {
    await this.authed(`/api/v1/lists/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async fetchListAccounts(id: string): Promise<MastodonAccount[]> {
    return arr(await this.authed(`/api/v1/lists/${encodeURIComponent(id)}/accounts`)).map(mapAccount);
  }

  async fetchListTimeline(id: string): Promise<MastodonStatus[]> {
    return arr(await this.authed(`/api/v1/timelines/list/${encodeURIComponent(id)}?limit=100`))
      .map((item) => mapStatus(item));
  }

  async addListAccount(listId: string, accountId: string, active: boolean): Promise<void> {
    await this.authed(`/api/v1/lists/${encodeURIComponent(listId)}/accounts`, {
      method: active ? "POST" : "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_ids: [accountId] }),
    });
  }

  async resolveAccount(handleInput: string): Promise<MastodonAccount> {
    const handle = handleInput.trim().replace(/^@/, "").toLowerCase();
    const raw = await this.authed(`/api/v1/accounts/search?${new URLSearchParams({ q: handle, limit: "20" })}`);
    const account = arr(raw).map(mapAccount).find((item) =>
      (item.acct || item.username).replace(/^@/, "").toLowerCase() === handle);
    if (!account?.id) throw new Error(`Could not find @${handle}`);
    return account;
  }

  async fetchCustomFeeds(): Promise<CustomFeed[]> {
    return arr(await this.authed("/api/v1/ailo/custom-feeds")).map(mapCustomFeed).filter((feed) => feed.id);
  }

  async fetchCustomFeed(id: string): Promise<CustomFeed> {
    return mapCustomFeed(await this.authed(`/api/v1/ailo/custom-feeds/${encodeURIComponent(id)}`));
  }

  async saveCustomFeed(input: CustomFeedInput, id?: string): Promise<CustomFeed> {
    return mapCustomFeed(await this.authed(id
      ? `/api/v1/ailo/custom-feeds/${encodeURIComponent(id)}` : "/api/v1/ailo/custom-feeds", {
      method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name, description: input.description,
        avatar_url: input.avatarUrl, banner_url: input.bannerUrl,
        accounts: input.accounts, hashtags: input.hashtags,
        semantic_keywords: input.semanticKeywords, exclude_words: input.excludeWords,
        exclude_accounts: input.excludeAccounts,
      }),
    }));
  }

  async deleteCustomFeed(id: string): Promise<void> {
    await this.authed(`/api/v1/ailo/custom-feeds/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async fetchCustomFeedTimeline(id: string): Promise<MastodonStatus[]> {
    const raw = await this.authed(`/api/v1/ailo/custom-feeds/${encodeURIComponent(id)}/timeline?limit=200`);
    return arr(raw).map((item) => mapStatus(item));
  }

  async fetchFilters(): Promise<MastodonFilter[]> {
    return arr(await this.authed("/api/v2/filters")).map(mapFilter);
  }

  async fetchFollowedTags(): Promise<MastodonTag[]> {
    return arr(await this.authed("/api/v1/followed_tags?limit=200")).map(mapTag);
  }

  async setTagFollow(name: string, active: boolean): Promise<MastodonTag> {
    return mapTag(await this.authed(
      `/api/v1/tags/${encodeURIComponent(name)}/${active ? "follow" : "unfollow"}`,
      { method: "POST" },
    ));
  }

  async fetchFeaturedTags(): Promise<MastodonFeaturedTag[]> {
    return arr(await this.authed("/api/v1/featured_tags")).map(mapFeaturedTag);
  }

  async fetchFeaturedTagSuggestions(): Promise<MastodonTag[]> {
    return arr(await this.authed("/api/v1/featured_tags/suggestions")).map(mapTag);
  }

  async featureTag(name: string): Promise<MastodonFeaturedTag> {
    return mapFeaturedTag(await this.authed("/api/v1/featured_tags", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }));
  }

  async unfeatureTag(id: string): Promise<void> {
    await this.authed(`/api/v1/featured_tags/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async createFilter(input: FilterInput): Promise<MastodonFilter> {
    const raw = await this.authed("/api/v2/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.trim(),
        context: ["home", "notifications", "public", "thread"],
        filter_action: input.action ?? "warn",
        keywords_attributes: keywordsAttributes(input.keywords),
      }),
    });
    return mapFilter(raw);
  }

  // The server replaces a filter's whole keyword list with whatever
  // keywords_attributes names on a PUT (lib/mastoapi.mjs's PUT handler:
  // `if (body.keywords_attributes) f.keywords = keywordsOf(...)`) — so this
  // always sends the full desired set rather than tracking which rows were
  // added/removed/edited since the filter was loaded for editing.
  async updateFilter(id: string, input: FilterInput): Promise<MastodonFilter> {
    const raw = await this.authed(`/api/v2/filters/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.trim(),
        filter_action: input.action ?? "warn",
        keywords_attributes: keywordsAttributes(input.keywords),
      }),
    });
    return mapFilter(raw);
  }

  async deleteFilter(id: string): Promise<void> {
    await this.authed(`/api/v2/filters/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /* ------------------------ AI providers, via FediPod ---------------------- */
  /* Ailo never holds provider keys itself — every call here just proxies to  */
  /* FediPod's /api/v1/ailo/ai/* endpoints over the existing authed session.  */

  async aiStatus(): Promise<AiStatus> {
    return mapAiStatus(await this.authed("/api/v1/ailo/ai/status"));
  }

  async providerCredentials(): Promise<ProviderCredentialsStatus> {
    return mapProviderCredentials(await this.authed("/api/v1/ailo/provider-credentials"));
  }

  async saveProviderCredential(
    provider: ProviderCredential,
    apiKey: string,
  ): Promise<ProviderCredentialState> {
    const raw = await this.authed(`/api/v1/ailo/provider-credentials/${provider}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    return mapProviderCredentials({ [provider]: raw })[provider];
  }

  async removeProviderCredential(provider: ProviderCredential): Promise<ProviderCredentialState> {
    const raw = await this.authed(`/api/v1/ailo/provider-credentials/${provider}`, { method: "DELETE" });
    return mapProviderCredentials({ [provider]: raw })[provider];
  }

  async testProviderCredential(
    provider: ProviderCredential,
    apiKey?: string,
  ): Promise<ProviderCredentialTestResult> {
    const raw = await this.authed(`/api/v1/ailo/provider-credentials/${provider}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiKey ? { api_key: apiKey } : {}),
    });
    if (!isRecord(raw) || raw.ok !== true || raw.provider !== provider
      || (raw.model != null && typeof raw.model !== "string")) {
      throw new Error("FediPod returned an invalid credential test result");
    }
    return { ok: true, provider, ...(raw.model ? { model: raw.model } : {}) };
  }

  async translationSettings(): Promise<TranslationSettings> {
    return mapTranslationSettings(await this.authed("/api/v1/ailo/translation/settings"));
  }

  async saveTranslationSettings(input: {
    provider: TranslationProvider | null;
    libreTranslateUrl: string;
    autoTranslate: boolean;
    targetLanguage: string;
  }): Promise<TranslationSettings> {
    return mapTranslationSettings(await this.authed("/api/v1/ailo/translation/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: input.provider,
        libretranslate_url: input.libreTranslateUrl,
        auto_translate: input.autoTranslate,
        target_language: input.targetLanguage,
      }),
    }));
  }

  async searchKlipyGifs(query: string, limit = 20): Promise<KlipyGif[]> {
    const raw = await this.authed("/api/v1/ailo/gifs/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, limit }),
    });
    const results = isRecord(raw) ? arr(raw.results) : [];
    return results.map((value): KlipyGif | null => {
      const item = isRecord(value) ? value : {};
      const id = str(item.id);
      const previewUrl = str(item.preview_url);
      if (!id || !previewUrl.startsWith("https://")) return null;
      return { id, title: str(item.title, "GIF"), previewUrl,
        width: typeof item.width === "number" ? item.width : null,
        height: typeof item.height === "number" ? item.height : null };
    }).filter((value): value is KlipyGif => value !== null);
  }

  async importKlipyGif(id: string, description?: string): Promise<MastodonMediaAttachment> {
    return mapMediaAttachment(await this.authed("/api/v1/ailo/gifs/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, description: description?.trim() || undefined }),
    }));
  }

  async uploadMediaFile(input: {
    filename: string;
    mimeType: string;
    data: Uint8Array;
    description?: string;
  }): Promise<MastodonMediaAttachment> {
    const form = new FormData();
    const bytes = new Uint8Array(input.data);
    form.append("file", new Blob([bytes], { type: input.mimeType }), input.filename);
    if (input.description?.trim()) form.append("description", input.description.trim());
    return mapMediaAttachment(await this.authed("/api/v2/media", { method: "POST", body: form }));
  }

  async updateMediaDescription(id: string, description: string): Promise<MastodonMediaAttachment> {
    return mapMediaAttachment(await this.authed(`/api/v1/media/${encodeURIComponent(id)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description.trim() }),
    }));
  }

  async aiTranslate(text: string, targetLang: string, provider?: TranslationProvider): Promise<string> {
    return mapTranslation(await this.authed("/api/v1/ailo/ai/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target_lang: targetLang, provider }),
    }));
  }

  async aiSuggestHashtags(text: string, provider?: AiProvider): Promise<string[]> {
    return mapHashtagSuggestions(await this.authed("/api/v1/ailo/ai/hashtags/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider }),
    }));
  }

  async aiDraftCustomFeed(prompt: string, provider?: AiProvider): Promise<CustomFeedInput> {
    const draft = mapCustomFeed(await this.authed("/api/v1/ailo/ai/custom-feeds/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, provider }),
    }));
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = draft;
    return input;
  }

  async aiAssistantChat(
    messages: AiAssistantMessage[],
    provider?: AiProvider,
  ): Promise<{ reply: string; provider: AiProvider | null; action: AiAssistantAction | null }> {
    const raw = await this.authed("/api/v1/ailo/ai/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, provider }),
    });
    const { reply, provider: usedProvider } = mapAssistantReply(raw);
    const rawAction = isRecord(raw) && isRecord(raw.action) ? raw.action : null;
    let action: AiAssistantAction | null = null;
    if (rawAction && rawAction.type === "custom_feed_draft") {
      const draft = mapCustomFeed(rawAction.draft);
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = draft;
      action = { type: "custom_feed_draft", draft: input };
    }
    return { reply, provider: usedProvider, action };
  }

  async aiSuggestModeration(provider?: AiProvider): Promise<AiModerationSuggestions> {
    return mapModerationSuggestions(await this.authed("/api/v1/ailo/ai/moderation/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    }));
  }

  async aiMatchFilters(
    queries: AiFilterMatchQuery[],
    documents: AiFilterMatchDocument[],
    provider?: AiProvider,
  ): Promise<AiFilterMatch[]> {
    return mapFilterMatches(await this.authed("/api/v1/ailo/ai/filters/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, documents, provider }),
    }));
  }

  async checkSafeBrowsing(urls: string[]): Promise<SafeBrowsingResult> {
    return mapSafeBrowsingResult(await this.authed("/api/v1/ailo/safety/urls/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    }));
  }

  /* --------------------------- Moderation summary --------------------------- */

  private async intakeModerationStats(
    days: number,
  ): Promise<{ blockedActor: number; blockedDomain: number; topDomains: ModerationDomainBreakdown[] }> {
    const raw = await this.authed(`/api/v1/ailo/moderation/intake-stats?days=${days}`);
    const r = isRecord(raw) ? raw : {};
    const topDomains = arr(r.topDomains).map((entry) => {
      const e = isRecord(entry) ? entry : {};
      return { domain: str(e.domain), count: num(e.count) };
    }).filter((entry) => entry.domain);
    return { blockedActor: num(r.blockedActor), blockedDomain: num(r.blockedDomain), topDomains };
  }

  async moderationStats(days = 7): Promise<ModerationStatsBundle> {
    // The "previous week" window (days*2) is fetched purely for the trend
    // arrow on the headline number — everything else in this bundle only
    // ever looks at the current `days` window.
    const [blocks, mutes, domainBlocks, filters, local, localPrevWindow, intake, intakePrevWindow] = await Promise.all([
      this.fetchBlockedAccounts(),
      this.fetchMutedAccounts(),
      this.fetchDomainBlocks(),
      this.fetchFilters(),
      localWeeklyModerationStats(days),
      localWeeklyModerationStats(days * 2),
      this.intakeModerationStats(days),
      this.intakeModerationStats(days * 2),
    ]);
    const filterTitleById = new Map(filters.map((filter) => [filter.id, filter.title]));
    const topFilters = local.byFilter.map((entry) => ({
      title: filterTitleById.get(entry.filterId) ?? "Deleted filter",
      count: entry.count,
    }));

    const contentBlocked = local.filteredPosts + intake.blockedActor + intake.blockedDomain;
    const contentBlockedPrevWindow = localPrevWindow.filteredPosts + intakePrevWindow.blockedActor + intakePrevWindow.blockedDomain;

    return {
      blockedAccounts: blocks.length,
      newBlockedAccounts: local.newBlocks,
      mutedAccounts: mutes.length,
      newMutedAccounts: local.newMutes,
      blockedDomains: domainBlocks.length,
      newBlockedDomains: local.newDomainBlocks,
      activeFilters: filters.length,
      activeKeywords: filters.reduce((sum, filter) => sum + filter.keywords.length, 0),
      filteredPosts: local.filteredPosts,
      intakeBlockedPosts: intake.blockedActor + intake.blockedDomain,
      // days*2 counts the current window too, so subtracting it out leaves
      // just the single week immediately before this one.
      previousWeekContentBlocked: Math.max(0, contentBlockedPrevWindow - contentBlocked),
      topDomains: intake.topDomains,
      topFilters,
    };
  }

  async summarizeModeration(provider?: AiProvider, days = 7): Promise<string> {
    const stats = await this.moderationStats(days);
    const raw = await this.authed("/api/v1/ailo/ai/moderation/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, stats }),
    });
    const r = isRecord(raw) ? raw : {};
    return str(r.summary);
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
      maxPinnedStatuses: Math.min(20, Math.max(1, num(statuses.max_pinned_statuses, 5))),
      supportsCommunityTargeting: bool(statuses.community_targeting),
      compatibility: parseFediPodCompatibility(raw),
    };
  }

  async resolveCommunity(handleInput: string): Promise<MastodonAccount> {
    const handle = normalizeCommunityHandle(handleInput);
    const params = new URLSearchParams({ q: handle, limit: "20" });
    const raw = await this.authed(`/api/v1/accounts/search?${params.toString()}`);
    const accounts = arr(raw).map(mapAccount);
    return requireExactGroup(accounts, handle);
  }

  async fetchSuggestions(): Promise<MastodonSuggestion[]> {
    return arr(await this.authed("/api/v2/suggestions?limit=40")).map((value) => {
      const r = isRecord(value) ? value : {};
      return { source: str(r.source, "global"), account: mapAccount(r.account) };
    }).filter((value) => value.account.id);
  }

  async dismissSuggestion(accountId: string): Promise<void> {
    await this.authed(`/api/v1/suggestions/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  }

  async fetchCollections(): Promise<MastodonCollection[]> {
    const account = (await this.config.load()).account;
    if (!account?.id) return [];
    const raw = await this.authed(`/api/v1/accounts/${encodeURIComponent(account.id)}/collections?limit=80`);
    return arr(isRecord(raw) ? raw.collections : []).map(mapCollection).filter((value) => value.id);
  }

  async createCollection(input: { name: string; description?: string; discoverable?: boolean }): Promise<MastodonCollection> {
    return mapCollection(await this.authed("/api/v1/collections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name.trim(), description: input.description?.trim() || "",
        discoverable: input.discoverable ?? true,
      }),
    }));
  }

  async deleteCollection(id: string): Promise<void> {
    await this.authed(`/api/v1/collections/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async addCollectionAccount(collectionId: string, accountId: string): Promise<void> {
    await this.authed(`/api/v1/collections/${encodeURIComponent(collectionId)}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId }),
    });
  }

  async fetchCollectionSources(): Promise<MastodonCollectionSource[]> {
    return arr(await this.authed("/api/v1/collection_sources"))
      .map(mapCollectionSource).filter((source) => source.id && source.url);
  }

  async previewCollectionSource(url: string): Promise<MastodonCollectionSourcePreview> {
    return mapCollectionSourcePreview(await this.authed("/api/v1/collection_sources/preview", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
    }));
  }

  async importCollectionSource(url: string): Promise<MastodonCollectionImportResult> {
    return mapCollectionImport(await this.authed("/api/v1/collection_sources/import", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
    }));
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
    quotedStatusId?: string | null;
    quoteApprovalPolicy?: MastodonQuotePolicy;
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
    if (input.quotedStatusId) body.quoted_status_id = input.quotedStatusId;
    if (input.quoteApprovalPolicy) body.quote_approval_policy = input.quoteApprovalPolicy;
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

  async setPin(id: string, active: boolean): Promise<MastodonStatus> {
    const raw = await this.authed(
      `/api/v1/statuses/${encodeURIComponent(id)}/${active ? "pin" : "unpin"}`,
      { method: "POST" },
    );
    return mapStatus(raw);
  }

  async setFollow(id: string, active: boolean): Promise<{ following: boolean }> {
    const raw = await this.authed(
      `/api/v1/accounts/${encodeURIComponent(id)}/${active ? "follow" : "unfollow"}`,
      { method: "POST" },
    );
    const r = isRecord(raw) ? raw : {};
    return { following: bool(r.following) };
  }

  async setBlock(id: string, active: boolean): Promise<MastodonRelationship> {
    const relationship = mapRelationship(await this.authed(
      `/api/v1/accounts/${encodeURIComponent(id)}/${active ? "block" : "unblock"}`,
      { method: "POST" },
    ));
    if (active) await recordModerationAction("block");
    return relationship;
  }

  async setMute(id: string, active: boolean): Promise<MastodonRelationship> {
    const relationship = mapRelationship(await this.authed(
      `/api/v1/accounts/${encodeURIComponent(id)}/${active ? "mute" : "unmute"}`,
      { method: "POST" },
    ));
    if (active) await recordModerationAction("mute");
    return relationship;
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
