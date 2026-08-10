import { ipcMain, logger } from "@glaze/core/backend";

import { fediPodService } from "../services/fedipod-service.js";
import { normalizeHashtag } from "../services/fedipod-tags.js";
import { postsStore } from "../services/posts-store.js";
import type { FediverseContentType, FediverseObjectType, FediverseVisibility } from "../types.js";
import type { MastodonQuotePolicy } from "../types.js";
import type { AiFilterMatchDocument, AiFilterMatchQuery, AiProvider, ProviderCredential } from "../types.js";

const VISIBILITIES: FediverseVisibility[] = ["public", "unlisted", "private", "direct"];
const OBJECT_TYPES: FediverseObjectType[] = ["Note", "Article"];
const CONTENT_TYPES: FediverseContentType[] = ["text/plain", "text/markdown", "text/x.misskeymarkdown"];
const QUOTE_POLICIES: MastodonQuotePolicy[] = ["public", "followers", "nobody"];

function asVisibility(value: unknown): FediverseVisibility {
  return typeof value === "string" && (VISIBILITIES as string[]).includes(value)
    ? (value as FediverseVisibility)
    : "public";
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value;
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

function asProviderCredential(value: unknown): ProviderCredential {
  if (value === "openai" || value === "gemini" || value === "safe_browsing") return value;
  throw new Error("Provider must be openai, gemini, or safe_browsing");
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
      keyword: requireString(data.keyword, "Filter keyword"),
      wholeWord: data.wholeWord === true,
      semantic: data.semantic !== false,
      semanticThreshold: typeof data.semanticThreshold === "number"
        ? Math.min(0.9, Math.max(0.3, data.semanticThreshold)) : 0.6,
      semanticModel: "embeddinggemma-300m",
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
      quotedStatusId: typeof data.quotedStatusId === "string" ? data.quotedStatusId : null,
      quoteApprovalPolicy: QUOTE_POLICIES.includes(data.quoteApprovalPolicy as MastodonQuotePolicy)
        ? data.quoteApprovalPolicy as MastodonQuotePolicy : "public",
    });
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

  ipcMain.handle("fedipod:aiTranslate", async (_event, text: unknown, targetLang: unknown, provider: unknown) => {
    return fediPodService.aiTranslate(requireString(text, "Text"), requireString(targetLang, "Target language"), asAiProvider(provider));
  });

  ipcMain.handle("fedipod:aiSuggestHashtags", async (_event, text: unknown, provider: unknown) => {
    return fediPodService.aiSuggestHashtags(requireString(text, "Text"), asAiProvider(provider));
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
