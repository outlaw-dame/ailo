import { ipcMain, logger } from "@glaze/core/backend";

import { fediPodService } from "../services/fedipod-service.js";
import { normalizeHashtag } from "../services/fedipod-tags.js";
import { postsStore } from "../services/posts-store.js";
import type { FediverseContentType, FediverseObjectType, FediverseVisibility } from "../types.js";
import type { MastodonQuotePolicy } from "../types.js";
import type {
  AiAssistantMessage, AiFilterMatchDocument, AiFilterMatchQuery, AiProvider, FilterKeywordInput, ProviderCredential,
  TranslationProvider,
} from "../types.js";
import { SEMANTIC_MODEL_GEMINI, SEMANTIC_MODEL_LOCAL, SEMANTIC_MODEL_OPENAI } from "../types.js";

const VISIBILITIES: FediverseVisibility[] = ["public", "unlisted", "private", "direct"];
const OBJECT_TYPES: FediverseObjectType[] = ["Note", "Article"];
const CONTENT_TYPES: FediverseContentType[] = ["text/plain", "text/markdown", "text/x.misskeymarkdown"];
const QUOTE_POLICIES: MastodonQuotePolicy[] = ["public", "followers", "nobody"];
const SEMANTIC_MODELS = [SEMANTIC_MODEL_LOCAL, SEMANTIC_MODEL_OPENAI, SEMANTIC_MODEL_GEMINI];
const MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
  "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-matroska",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

function asVisibility(value: unknown): FediverseVisibility {
  return typeof value === "string" && (VISIBILITIES as string[]).includes(value)
    ? (value as FediverseVisibility)
    : "public";
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value;
}

// A filter needs at least one keyword row — Mastodon's own filters allow
// several, which single-`keyword` createFilter never let this client send.
function requireFilterKeywords(value: unknown): FilterKeywordInput[] {
  const rows = Array.isArray(value) ? value : [];
  const keywords = rows
    .map((row) => (typeof row === "object" && row !== null ? row as Record<string, unknown> : {}))
    .filter((row) => typeof row.keyword === "string" && row.keyword.trim())
    .map((row): FilterKeywordInput => ({
      keyword: (row.keyword as string).trim(),
      wholeWord: row.wholeWord === true,
      semantic: row.semantic !== false,
      semanticThreshold: typeof row.semanticThreshold === "number"
        ? Math.min(0.9, Math.max(0.3, row.semanticThreshold)) : 0.6,
      semanticModel: typeof row.semanticModel === "string" && SEMANTIC_MODELS.includes(row.semanticModel)
        ? row.semanticModel : SEMANTIC_MODEL_LOCAL,
    }));
  if (!keywords.length) throw new Error("at least one keyword or phrase is required");
  return keywords;
}

function requireHashtag(value: unknown): string {
  const tag = normalizeHashtag(value);
  if (tag) return tag;
  throw new Error("Hashtag must contain letters or an underscore and no spaces or punctuation");
}

function asAiProvider(value: unknown): AiProvider | undefined {
  if (value == null || value === "") return undefined;
  if (value === "openai" || value === "gemini") return value;
  throw new Error("AI provider must be openai or gemini");
}

function requireAssistantMessages(value: unknown): AiAssistantMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    throw new Error("Assistant chat needs 1–40 messages");
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object"
      || (entry as { role?: unknown }).role !== "user" && (entry as { role?: unknown }).role !== "assistant"
      || typeof (entry as { content?: unknown }).content !== "string"
      || !(entry as { content: string }).content.trim()
      || (entry as { content: string }).content.length > 4_000) {
      throw new Error("Each message needs a user/assistant role and 1–4000 characters of content");
    }
    return entry as AiAssistantMessage;
  });
}

function asProviderCredential(value: unknown): ProviderCredential {
  if (value === "openai" || value === "gemini" || value === "safe_browsing" || value === "klipy"
    || value === "deepl" || value === "libretranslate") return value;
  throw new Error("Unknown provider");
}

function asTranslationProvider(value: unknown): TranslationProvider | undefined {
  if (value == null || value === "" || value === "auto") return undefined;
  if (value === "openai" || value === "gemini" || value === "deepl" || value === "libretranslate") return value;
  throw new Error("Unknown translation provider");
}

function requireApiKey(value: unknown): string {
  if (typeof value !== "string") throw new Error("API key is required");
  const key = value.trim();
  if (!key || key.length > 1_024
    || Array.from(key).some((character) => character.charCodeAt(0) <= 0x20 || character.charCodeAt(0) === 0x7f)) {
    throw new Error("API key must contain 1–1024 non-whitespace characters");
  }
  return key;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of at most 100 strings`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].map((item) => {
    if (item.length > 200) throw new Error(`${field} entries must be at most 200 characters`);
    return item;
  });
}

function optionalGateToken(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Tunnel access token must be a string");
  const token = value.trim();
  if (!token || token.length > 1_024
    || Array.from(token).some((character) => character.charCodeAt(0) <= 0x20 || character.charCodeAt(0) === 0x7f)) {
    throw new Error("Tunnel access token must contain 1–1024 non-whitespace characters");
  }
  return token;
}

export function registerFediPodHandlers(): void {
  ipcMain.handle("fedipod:status", async () => {
    return fediPodService.getStatus();
  });

  ipcMain.handle("fedipod:connect", async (
    _event,
    baseUrl: unknown,
    token: unknown,
    gateToken: unknown,
  ) => {
    try {
      const account = await fediPodService.connect(
        requireString(baseUrl, "FediPod URL"),
        requireString(token, "Access token"),
        optionalGateToken(gateToken),
      );
      const status = await fediPodService.getStatus();
      ipcMain.broadcast("fedipod:status-changed", status);
      return { connected: true, account };
    } catch (error) {
      logger.error("fedipod", `connect failed: ${String(error)}`);
      throw error;
    }
  });

  ipcMain.handle("fedipod:login", async (
    _event,
    baseUrl: unknown,
    password: unknown,
    gateToken: unknown,
  ) => {
    try {
      const result = await fediPodService.loginWithOneClick(
        requireString(baseUrl, "FediPod URL"),
        typeof password === "string" && password.trim() ? password.trim() : undefined,
        optionalGateToken(gateToken),
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

  ipcMain.handle("fedipod:tagTimeline", async (_event, tag: unknown, options: unknown) => {
    const opts =
      typeof options === "object" && options !== null ? (options as Record<string, unknown>) : {};
    return fediPodService.fetchTagTimeline(requireHashtag(tag), {
      maxId: typeof opts.maxId === "string" ? opts.maxId : undefined,
      limit: typeof opts.limit === "number" ? opts.limit : undefined,
    });
  });

  ipcMain.handle("fedipod:notifications", async () => {
    return fediPodService.fetchNotifications();
  });

  ipcMain.handle("fedipod:creatorAttribution", async () =>
    fediPodService.fetchCreatorAttribution());
  ipcMain.handle("fedipod:updateCreatorAttribution", async (_event, domains: unknown) => {
    if (!Array.isArray(domains) || domains.length > 100
      || domains.some((domain) => typeof domain !== "string")) {
      throw new Error("Creator domains must be an array of at most 100 domain names");
    }
    return fediPodService.updateCreatorAttribution(domains);
  });

  ipcMain.handle("fedipod:blocks", async () => fediPodService.fetchBlockedAccounts());
  ipcMain.handle("fedipod:mutes", async () => fediPodService.fetchMutedAccounts());
  ipcMain.handle("fedipod:domainBlocks", async () => fediPodService.fetchDomainBlocks());
  ipcMain.handle("fedipod:setDomainBlock", async (_event, domain: unknown, active: unknown) => {
    await fediPodService.setDomainBlock(requireString(domain, "Domain"), active !== false);
    return { ok: true };
  });
  ipcMain.handle("fedipod:lists", async () => fediPodService.fetchLists());
  ipcMain.handle("fedipod:createList", async (_event, title: unknown) =>
    fediPodService.createList(requireString(title, "List title")));
  ipcMain.handle("fedipod:deleteList", async (_event, id: unknown) => {
    await fediPodService.deleteList(requireString(id, "List id"));
    return { ok: true };
  });
  ipcMain.handle("fedipod:listAccounts", async (_event, id: unknown) =>
    fediPodService.fetchListAccounts(requireString(id, "List id")));
  ipcMain.handle("fedipod:listTimeline", async (_event, id: unknown) =>
    fediPodService.fetchListTimeline(requireString(id, "List id")));
  ipcMain.handle("fedipod:setListAccount", async (
    _event, listId: unknown, handle: unknown, active: unknown,
  ) => {
    const account = await fediPodService.resolveAccount(requireString(handle, "Account"));
    await fediPodService.addListAccount(requireString(listId, "List id"), account.id, active !== false);
    return account;
  });
  ipcMain.handle("fedipod:customFeeds", async () => fediPodService.fetchCustomFeeds());
  ipcMain.handle("fedipod:customFeed", async (_event, id: unknown) =>
    fediPodService.fetchCustomFeed(requireString(id, "Feed id")));
  ipcMain.handle("fedipod:saveCustomFeed", async (_event, input: unknown, id: unknown) => {
    const data = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
    return fediPodService.saveCustomFeed({
      name: requireString(data.name, "Feed name").slice(0, 80),
      description: typeof data.description === "string" ? data.description.trim().slice(0, 500) : "",
      avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl.trim() || null : null,
      bannerUrl: typeof data.bannerUrl === "string" ? data.bannerUrl.trim() || null : null,
      accounts: stringList(data.accounts, "Accounts"),
      hashtags: stringList(data.hashtags, "Hashtags"),
      semanticKeywords: stringList(data.semanticKeywords, "Topic phrases"),
      excludeWords: stringList(data.excludeWords, "Excluded words"),
      excludeAccounts: stringList(data.excludeAccounts, "Excluded accounts"),
    }, typeof id === "string" && id ? id : undefined);
  });
  ipcMain.handle("fedipod:deleteCustomFeed", async (_event, id: unknown) => {
    await fediPodService.deleteCustomFeed(requireString(id, "Feed id"));
    return { ok: true };
  });
  ipcMain.handle("fedipod:customFeedTimeline", async (_event, id: unknown) =>
    fediPodService.fetchCustomFeedTimeline(requireString(id, "Feed id")));
  ipcMain.handle("fedipod:aiDraftCustomFeed", async (_event, prompt: unknown, provider: unknown) =>
    fediPodService.aiDraftCustomFeed(requireString(prompt, "Feed description").slice(0, 4_000), asAiProvider(provider)));
  ipcMain.handle("fedipod:filters", async () => fediPodService.fetchFilters());
  ipcMain.handle("fedipod:followedTags", async () => fediPodService.fetchFollowedTags());
  ipcMain.handle("fedipod:featuredTags", async () => fediPodService.fetchFeaturedTags());
  ipcMain.handle("fedipod:featuredTagSuggestions", async () => fediPodService.fetchFeaturedTagSuggestions());
  ipcMain.handle("fedipod:suggestions", async () => fediPodService.fetchSuggestions());
  ipcMain.handle("fedipod:collections", async () => fediPodService.fetchCollections());
  ipcMain.handle("fedipod:collectionSources", async () => fediPodService.fetchCollectionSources());
  ipcMain.handle("fedipod:previewCollectionSource", async (_event, url: unknown) =>
    fediPodService.previewCollectionSource(requireString(url, "Collection source URL")));
  ipcMain.handle("fedipod:importCollectionSource", async (_event, url: unknown) =>
    fediPodService.importCollectionSource(requireString(url, "Collection source URL")));

  ipcMain.handle("fedipod:dismissSuggestion", async (_event, id: unknown) => {
    await fediPodService.dismissSuggestion(requireString(id, "Account id"));
    return { ok: true };
  });
  ipcMain.handle("fedipod:createCollection", async (_event, input: unknown) => {
    const data = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
    return fediPodService.createCollection({
      name: requireString(data.name, "Collection name"),
      description: typeof data.description === "string" ? data.description : "",
      discoverable: data.discoverable !== false,
    });
  });
  ipcMain.handle("fedipod:deleteCollection", async (_event, id: unknown) => {
    await fediPodService.deleteCollection(requireString(id, "Collection id"));
    return { ok: true };
  });
  ipcMain.handle("fedipod:addCollectionAccount", async (_event, collectionId: unknown, accountId: unknown) => {
    await fediPodService.addCollectionAccount(
      requireString(collectionId, "Collection id"), requireString(accountId, "Account id"),
    );
    return { ok: true };
  });

  ipcMain.handle("fedipod:followTag", async (_event, name: unknown, active: unknown) => {
    return fediPodService.setTagFollow(requireHashtag(name), active !== false);
  });
  ipcMain.handle("fedipod:featureTag", async (_event, name: unknown) => {
    return fediPodService.featureTag(requireHashtag(name));
  });
  ipcMain.handle("fedipod:unfeatureTag", async (_event, id: unknown) => {
    await fediPodService.unfeatureTag(requireString(id, "Featured tag id"));
    return { ok: true };
  });

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
      keywords: requireFilterKeywords(data.keywords),
      action: data.action === "hide" ? "hide" : "warn",
    });
  });

  ipcMain.handle("fedipod:updateFilter", async (_event, id: unknown, input: unknown) => {
    const data = typeof input === "object" && input !== null
      ? (input as Record<string, unknown>) : {};
    return fediPodService.updateFilter(requireString(id, "Filter id"), {
      title: requireString(data.title, "Filter title"),
      keywords: requireFilterKeywords(data.keywords),
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
    const mediaIds = Array.isArray(data.mediaIds)
      ? data.mediaIds.slice(0, 4).map((id) => requireString(id, "Media id")) : [];
    const status = typeof data.status === "string" ? data.status.trim() : "";
    if (!status && mediaIds.length === 0) throw new Error("Add text or media before posting");
    return fediPodService.postStatus({
      status,
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
      quotedStatusId: typeof data.quotedStatusId === "string" ? data.quotedStatusId : null,
      quoteApprovalPolicy: QUOTE_POLICIES.includes(data.quoteApprovalPolicy as MastodonQuotePolicy)
        ? data.quoteApprovalPolicy as MastodonQuotePolicy : "public",
      mediaIds,
    });
  });

  ipcMain.handle("fedipod:uploadMedia", async (_event, input: unknown) => {
    const data = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
    const filename = requireString(data.filename, "Filename");
    if (filename.length > 255 || filename.includes("/") || filename.includes("\\")
      || Array.from(filename).some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) {
      throw new Error("Filename is invalid");
    }
    const mimeType = requireString(data.mimeType, "Media type").toLowerCase();
    if (!MEDIA_TYPES.has(mimeType)) throw new Error("Use a JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, Ogg video, Matroska, or QuickTime file");
    const bytes = data.data instanceof ArrayBuffer ? new Uint8Array(data.data)
      : ArrayBuffer.isView(data.data) ? new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength) : null;
    const limit = mimeType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!bytes?.byteLength || bytes.byteLength > limit) {
      throw new Error(`Media must be between 1 byte and ${limit / 1024 / 1024} MB`);
    }
    return fediPodService.uploadMediaFile({ filename, mimeType, data: bytes,
      description: typeof data.description === "string" ? data.description.slice(0, 1500) : undefined });
  });

  ipcMain.handle("fedipod:updateMediaDescription", async (_event, id: unknown, description: unknown) => {
    const value = typeof description === "string" ? description.trim() : "";
    if (value.length > 1500) throw new Error("Media description must be at most 1500 characters");
    return fediPodService.updateMediaDescription(requireString(id, "Media id"), value);
  });

  ipcMain.handle("fedipod:searchGifs", async (_event, query: unknown) => {
    const value = requireString(query, "GIF search");
    if ([...value].length > 100) throw new Error("GIF search must contain at most 100 characters");
    return fediPodService.searchKlipyGifs(value, 20);
  });

  ipcMain.handle("fedipod:importGif", async (_event, id: unknown, description: unknown) => {
    const value = requireString(id, "GIF selection");
    if (value.length > 128) throw new Error("GIF selection is invalid");
    return fediPodService.importKlipyGif(value,
      typeof description === "string" ? description.slice(0, 1500) : undefined);
  });

  ipcMain.handle("fedipod:favourite", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setFavourite(requireString(id, "Status id"), active !== false);
  });

  ipcMain.handle("fedipod:boost", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setBoost(requireString(id, "Status id"), active !== false);
  });

  ipcMain.handle("fedipod:pin", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setPin(requireString(id, "Status id"), active !== false);
  });

  ipcMain.handle("fedipod:follow", async (_event, id: unknown, active: unknown) => {
    return fediPodService.setFollow(requireString(id, "Account id"), active !== false);
  });

  ipcMain.handle("fedipod:crossPost", async (_event, postId: unknown, visibility: unknown) => {
    const post = await postsStore.get(requireString(postId, "Post id"));
    if (!post) throw new Error(`Post not found: ${String(postId)}`);
    return fediPodService.crossPostStory(post, asVisibility(visibility));
  });

  /* ------------------------ AI providers, via FediPod ---------------------- */

  ipcMain.handle("fedipod:aiStatus", async () => {
    return fediPodService.aiStatus();
  });

  ipcMain.handle("fedipod:providerCredentials", async () => {
    return fediPodService.providerCredentials();
  });

  ipcMain.handle("fedipod:saveProviderCredential", async (_event, provider: unknown, apiKey: unknown) => {
    return fediPodService.saveProviderCredential(asProviderCredential(provider), requireApiKey(apiKey));
  });

  ipcMain.handle("fedipod:removeProviderCredential", async (_event, provider: unknown) => {
    return fediPodService.removeProviderCredential(asProviderCredential(provider));
  });

  ipcMain.handle("fedipod:testProviderCredential", async (_event, provider: unknown, apiKey: unknown) => {
    return fediPodService.testProviderCredential(
      asProviderCredential(provider),
      apiKey == null || apiKey === "" ? undefined : requireApiKey(apiKey),
    );
  });

  ipcMain.handle("fedipod:translationSettings", async () => fediPodService.translationSettings());
  ipcMain.handle("fedipod:saveTranslationSettings", async (_event, input: unknown) => {
    const data = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
    const url = requireString(data.libreTranslateUrl, "LibreTranslate URL");
    if (url.length > 2_048) throw new Error("LibreTranslate URL must be at most 2048 characters");
    const targetLanguage = requireString(data.targetLanguage, "Target language");
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z]{2})?$/.test(targetLanguage)) {
      throw new Error("Target language must be a valid language code");
    }
    return fediPodService.saveTranslationSettings({
      provider: asTranslationProvider(data.provider) ?? null,
      libreTranslateUrl: url,
      autoTranslate: data.autoTranslate === true,
      targetLanguage,
    });
  });

  ipcMain.handle("fedipod:aiTranslate", async (_event, text: unknown, targetLang: unknown, provider: unknown) => {
    return fediPodService.aiTranslate(requireString(text, "Text"), requireString(targetLang, "Target language"), asTranslationProvider(provider));
  });

  ipcMain.handle("fedipod:aiSuggestHashtags", async (_event, text: unknown, provider: unknown) => {
    return fediPodService.aiSuggestHashtags(requireString(text, "Text"), asAiProvider(provider));
  });

  ipcMain.handle("fedipod:aiAssistantChat", async (_event, messages: unknown, provider: unknown) => {
    return fediPodService.aiAssistantChat(requireAssistantMessages(messages), asAiProvider(provider));
  });

  ipcMain.handle("fedipod:aiSuggestModeration", async (_event, provider: unknown) => {
    return fediPodService.aiSuggestModeration(asAiProvider(provider));
  });

  ipcMain.handle("fedipod:aiMatchFilters", async (_event, queries: unknown, documents: unknown, provider: unknown) => {
    return fediPodService.aiMatchFilters(
      Array.isArray(queries) ? queries as AiFilterMatchQuery[] : [],
      Array.isArray(documents) ? documents as AiFilterMatchDocument[] : [],
      asAiProvider(provider),
    );
  });

  ipcMain.handle("fedipod:checkSafeBrowsing", async (_event, urls: unknown) => {
    if (!Array.isArray(urls) || urls.length < 1 || urls.length > 50
      || urls.some((url) => typeof url !== "string" || url.length > 2_048)) {
      throw new Error("Safe Browsing accepts 1–50 URLs of at most 2048 characters");
    }
    return fediPodService.checkSafeBrowsing(urls);
  });
}
