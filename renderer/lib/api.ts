import type {
  AiAssistantAction,
  AiAssistantMessage,
  AiFilterMatch,
  AiFilterMatchDocument,
  AiFilterMatchQuery,
  AiModerationSuggestions,
  ModerationStatsBundle,
  AiProvider,
  AiStatus,
  ProviderCredential,
  ProviderCredentialState,
  ProviderCredentialsStatus,
  ProviderCredentialTestResult,
  FediPodLoginResult,
  FediPodCapabilities,
  FediPodStatus,
  FediverseContentType,
  FediverseObjectType,
  FediverseVisibility,
  GitHubRepoSummary,
  GitHubStatus,
  ImageAltText,
  CustomFeed,
  CustomFeedInput,
  MastodonAccount,
  MastodonCollection,
  MastodonCollectionImportResult,
  MastodonCollectionSource,
  MastodonCollectionSourcePreview,
  MastodonCreatorAttribution,
  MastodonFilter,
  FilterInput,
  MastodonFeaturedTag,
  MastodonNotification,
  MastodonMediaAttachment,
  MastodonList,
  MastodonRelationship,
  MastodonStatus,
  MastodonSuggestion,
  MastodonQuotePolicy,
  MastodonTag,
  KlipyGif,
  SafeBrowsingResult,
  Post,
  Profile,
  PublishResults,
  SolidStatus,
  TranslationProvider,
  TranslationSettings,
} from "./types";

const ipc = () => window.glazeAPI.glaze.ipc;

export interface PostInput {
  title: string;
  body: string;
  contentWarning?: string | null;
  altTexts?: ImageAltText[];
  tags?: string[];
  status?: "draft" | "published";
}

export const api = {
  posts: {
    list: () => ipc().invoke("posts:list") as Promise<Post[]>,
    get: (id: string) => ipc().invoke("posts:get", id) as Promise<Post | null>,
    create: (input: PostInput) => ipc().invoke("posts:create", input) as Promise<Post>,
    update: (id: string, input: Partial<PostInput>) =>
      ipc().invoke("posts:update", id, input) as Promise<Post>,
    remove: (id: string) => ipc().invoke("posts:delete", id) as Promise<{ ok: true }>,
  },
  profile: {
    get: () => ipc().invoke("profile:get") as Promise<Profile>,
    update: (patch: Partial<Profile>) => ipc().invoke("profile:update", patch) as Promise<Profile>,
  },
  github: {
    connect: () =>
      ipc().invoke("github:connect") as Promise<{ connected: true; user: GitHubStatus["user"] }>,
    disconnect: () => ipc().invoke("github:disconnect") as Promise<{ connected: false }>,
    status: () => ipc().invoke("github:status") as Promise<GitHubStatus>,
    listRepos: () => ipc().invoke("github:listRepos") as Promise<GitHubRepoSummary[]>,
    createRepo: (name: string, isPrivate = false) =>
      ipc().invoke("github:createRepo", name, isPrivate) as Promise<GitHubRepoSummary>,
    setRepo: (fullName: string) =>
      ipc().invoke("github:setRepo", fullName) as Promise<{ repo: string }>,
  },
  solid: {
    connect: (issuer?: string) =>
      ipc().invoke("solid:connect", issuer) as Promise<{
        connected: true;
        webId: string;
        issuer: string;
      }>,
    disconnect: () => ipc().invoke("solid:disconnect") as Promise<{ connected: false }>,
    status: () => ipc().invoke("solid:status") as Promise<SolidStatus>,
  },
  publish: {
    post: (postId: string) =>
      ipc().invoke("publish:post", postId) as Promise<{ post: Post; results: PublishResults }>,
  },
  fedipod: {
    status: () => ipc().invoke("fedipod:status") as Promise<FediPodStatus>,
    connect: (baseUrl: string, token: string, gateToken?: string) =>
      ipc().invoke("fedipod:connect", baseUrl, token, gateToken) as Promise<{
        connected: true;
        account: MastodonAccount;
      }>,
    login: (baseUrl: string, password?: string, gateToken?: string) =>
      ipc().invoke("fedipod:login", baseUrl, password, gateToken) as Promise<FediPodLoginResult>,
    disconnect: () => ipc().invoke("fedipod:disconnect") as Promise<{ connected: false }>,
    timeline: (options?: { maxId?: string; limit?: number }) =>
      ipc().invoke("fedipod:timeline", options ?? {}) as Promise<MastodonStatus[]>,
    tagTimeline: (tag: string, options?: { maxId?: string; limit?: number }) =>
      ipc().invoke("fedipod:tagTimeline", tag, options ?? {}) as Promise<MastodonStatus[]>,
    notifications: () => ipc().invoke("fedipod:notifications") as Promise<MastodonNotification[]>,
    creatorAttribution: () =>
      ipc().invoke("fedipod:creatorAttribution") as Promise<MastodonCreatorAttribution>,
    updateCreatorAttribution: (domains: string[]) =>
      ipc().invoke("fedipod:updateCreatorAttribution", domains) as Promise<MastodonCreatorAttribution>,
    blocks: () => ipc().invoke("fedipod:blocks") as Promise<MastodonAccount[]>,
    mutes: () => ipc().invoke("fedipod:mutes") as Promise<MastodonAccount[]>,
    domainBlocks: () => ipc().invoke("fedipod:domainBlocks") as Promise<string[]>,
    setDomainBlock: (domain: string, active: boolean) =>
      ipc().invoke("fedipod:setDomainBlock", domain, active) as Promise<{ ok: true }>,
    lists: () => ipc().invoke("fedipod:lists") as Promise<MastodonList[]>,
    createList: (title: string) => ipc().invoke("fedipod:createList", title) as Promise<MastodonList>,
    deleteList: (id: string) => ipc().invoke("fedipod:deleteList", id) as Promise<{ ok: true }>,
    listAccounts: (id: string) => ipc().invoke("fedipod:listAccounts", id) as Promise<MastodonAccount[]>,
    listTimeline: (id: string) => ipc().invoke("fedipod:listTimeline", id) as Promise<MastodonStatus[]>,
    setListAccount: (listId: string, handle: string, active: boolean) =>
      ipc().invoke("fedipod:setListAccount", listId, handle, active) as Promise<MastodonAccount>,
    customFeeds: () => ipc().invoke("fedipod:customFeeds") as Promise<CustomFeed[]>,
    customFeed: (id: string) => ipc().invoke("fedipod:customFeed", id) as Promise<CustomFeed>,
    saveCustomFeed: (input: CustomFeedInput, id?: string) =>
      ipc().invoke("fedipod:saveCustomFeed", input, id) as Promise<CustomFeed>,
    deleteCustomFeed: (id: string) =>
      ipc().invoke("fedipod:deleteCustomFeed", id) as Promise<{ ok: true }>,
    customFeedTimeline: (id: string) =>
      ipc().invoke("fedipod:customFeedTimeline", id) as Promise<MastodonStatus[]>,
    filters: () => ipc().invoke("fedipod:filters") as Promise<MastodonFilter[]>,
    followedTags: () => ipc().invoke("fedipod:followedTags") as Promise<MastodonTag[]>,
    featuredTags: () => ipc().invoke("fedipod:featuredTags") as Promise<MastodonFeaturedTag[]>,
    featuredTagSuggestions: () =>
      ipc().invoke("fedipod:featuredTagSuggestions") as Promise<MastodonTag[]>,
    suggestions: () => ipc().invoke("fedipod:suggestions") as Promise<MastodonSuggestion[]>,
    dismissSuggestion: (id: string) =>
      ipc().invoke("fedipod:dismissSuggestion", id) as Promise<{ ok: true }>,
    collections: () => ipc().invoke("fedipod:collections") as Promise<MastodonCollection[]>,
    collectionSources: () =>
      ipc().invoke("fedipod:collectionSources") as Promise<MastodonCollectionSource[]>,
    previewCollectionSource: (url: string) =>
      ipc().invoke("fedipod:previewCollectionSource", url) as Promise<MastodonCollectionSourcePreview>,
    importCollectionSource: (url: string) =>
      ipc().invoke("fedipod:importCollectionSource", url) as Promise<MastodonCollectionImportResult>,
    createCollection: (input: { name: string; description?: string; discoverable?: boolean }) =>
      ipc().invoke("fedipod:createCollection", input) as Promise<MastodonCollection>,
    deleteCollection: (id: string) =>
      ipc().invoke("fedipod:deleteCollection", id) as Promise<{ ok: true }>,
    addCollectionAccount: (collectionId: string, accountId: string) =>
      ipc().invoke("fedipod:addCollectionAccount", collectionId, accountId) as Promise<{ ok: true }>,
    followTag: (name: string, active: boolean) =>
      ipc().invoke("fedipod:followTag", name, active) as Promise<MastodonTag>,
    featureTag: (name: string) =>
      ipc().invoke("fedipod:featureTag", name) as Promise<MastodonFeaturedTag>,
    unfeatureTag: (id: string) =>
      ipc().invoke("fedipod:unfeatureTag", id) as Promise<{ ok: true }>,
    block: (id: string, active: boolean) =>
      ipc().invoke("fedipod:block", id, active) as Promise<MastodonRelationship>,
    mute: (id: string, active: boolean) =>
      ipc().invoke("fedipod:mute", id, active) as Promise<MastodonRelationship>,
    createFilter: (input: FilterInput) =>
      ipc().invoke("fedipod:createFilter", input) as Promise<MastodonFilter>,
    updateFilter: (id: string, input: FilterInput) =>
      ipc().invoke("fedipod:updateFilter", id, input) as Promise<MastodonFilter>,
    deleteFilter: (id: string) =>
      ipc().invoke("fedipod:deleteFilter", id) as Promise<{ ok: true }>,
    moderationStats: () =>
      ipc().invoke("fedipod:moderationStats") as Promise<ModerationStatsBundle>,
    recordFilterHits: (keys: string[]) =>
      ipc().invoke("fedipod:recordFilterHits", keys) as Promise<{ ok: true }>,
    capabilities: () => ipc().invoke("fedipod:capabilities") as Promise<FediPodCapabilities>,
    resolveCommunity: (handle: string) =>
      ipc().invoke("fedipod:resolveCommunity", handle) as Promise<MastodonAccount>,
    post: (input: {
      status: string;
      spoilerText?: string | null;
      visibility?: FediverseVisibility;
      inReplyToId?: string | null;
      community?: string | null;
      objectType?: FediverseObjectType;
      title?: string | null;
      contentType?: FediverseContentType;
      quotedStatusId?: string | null;
      quoteApprovalPolicy?: MastodonQuotePolicy;
      mediaIds?: string[];
    }) => ipc().invoke("fedipod:post", input) as Promise<MastodonStatus>,
    uploadMedia: (input: { filename: string; mimeType: string; data: ArrayBuffer; description?: string }) =>
      ipc().invoke("fedipod:uploadMedia", input) as Promise<MastodonMediaAttachment>,
    updateMediaDescription: (id: string, description: string) =>
      ipc().invoke("fedipod:updateMediaDescription", id, description) as Promise<MastodonMediaAttachment>,
    searchGifs: (query: string) =>
      ipc().invoke("fedipod:searchGifs", query) as Promise<KlipyGif[]>,
    importGif: (id: string, description?: string) =>
      ipc().invoke("fedipod:importGif", id, description) as Promise<MastodonMediaAttachment>,
    favourite: (id: string, active: boolean) =>
      ipc().invoke("fedipod:favourite", id, active) as Promise<MastodonStatus>,
    boost: (id: string, active: boolean) =>
      ipc().invoke("fedipod:boost", id, active) as Promise<MastodonStatus>,
    pin: (id: string, active: boolean) =>
      ipc().invoke("fedipod:pin", id, active) as Promise<MastodonStatus>,
    follow: (id: string, active: boolean) =>
      ipc().invoke("fedipod:follow", id, active) as Promise<{ following: boolean }>,
    crossPost: (postId: string, visibility?: FediverseVisibility) =>
      ipc().invoke("fedipod:crossPost", postId, visibility) as Promise<{
        id: string;
        url: string | null;
      }>,
  },
  app: {
    openExternal: (url: string) => ipc().invoke("app:openExternal", url) as Promise<{ ok: true }>,
    openSettings: () => ipc().invoke("window:openSettings") as Promise<void>,
  },
  // Provider-backed features. Keys transit Ailo only when the user submits the
  // password field, then remain in FediPod's owner-only local store. Stored
  // values can never be read back through this API.
  ai: {
    status: () => ipc().invoke("fedipod:aiStatus") as Promise<AiStatus>,
    credentials: () =>
      ipc().invoke("fedipod:providerCredentials") as Promise<ProviderCredentialsStatus>,
    saveCredential: (provider: ProviderCredential, apiKey: string) =>
      ipc().invoke("fedipod:saveProviderCredential", provider, apiKey) as Promise<ProviderCredentialState>,
    removeCredential: (provider: ProviderCredential) =>
      ipc().invoke("fedipod:removeProviderCredential", provider) as Promise<ProviderCredentialState>,
    testCredential: (provider: ProviderCredential, apiKey?: string) =>
      ipc().invoke("fedipod:testProviderCredential", provider, apiKey) as Promise<ProviderCredentialTestResult>,
    translationSettings: () =>
      ipc().invoke("fedipod:translationSettings") as Promise<TranslationSettings>,
    saveTranslationSettings: (input: {
      provider: TranslationProvider | null;
      libreTranslateUrl: string;
      autoTranslate: boolean;
      targetLanguage: string;
    }) =>
      ipc().invoke("fedipod:saveTranslationSettings", input) as Promise<TranslationSettings>,
    translate: (text: string, targetLang: string, provider?: TranslationProvider) =>
      ipc().invoke("fedipod:aiTranslate", text, targetLang, provider) as Promise<string>,
    suggestHashtags: (text: string, provider?: AiProvider) =>
      ipc().invoke("fedipod:aiSuggestHashtags", text, provider) as Promise<string[]>,
    assistantChat: (messages: AiAssistantMessage[], provider?: AiProvider) =>
      ipc().invoke("fedipod:aiAssistantChat", messages, provider) as
        Promise<{ reply: string; provider: AiProvider | null; action: AiAssistantAction | null }>,
    draftCustomFeed: (prompt: string, provider?: AiProvider) =>
      ipc().invoke("fedipod:aiDraftCustomFeed", prompt, provider) as Promise<CustomFeedInput>,
    suggestModeration: (provider?: AiProvider) =>
      ipc().invoke("fedipod:aiSuggestModeration", provider) as Promise<AiModerationSuggestions>,
    summarizeModeration: (provider?: AiProvider) =>
      ipc().invoke("fedipod:aiSummarizeModeration", provider) as Promise<string>,
    matchFilters: (queries: AiFilterMatchQuery[], documents: AiFilterMatchDocument[], provider?: AiProvider) =>
      ipc().invoke("fedipod:aiMatchFilters", queries, documents, provider) as Promise<AiFilterMatch[]>,
  },
  safety: {
    checkUrls: (urls: string[]) =>
      ipc().invoke("fedipod:checkSafeBrowsing", urls) as Promise<SafeBrowsingResult>,
  },
};
