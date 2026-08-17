export interface ImageAltText {
  src: string;
  alt: string;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  contentWarning: string | null;
  altTexts: ImageAltText[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  solidUrl: string | null;
  githubPath: string | null;
  status: "draft" | "published";
}

export interface Profile {
  displayName: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  calComPath: string;
  solidIssuer: string;
  solidPodRoot: string;
  githubLogin: string | null;
  githubRepo: string | null;
  solidWebId: string | null;
  fediverseCreatorEnabled: boolean;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface GitHubRepoSummary {
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string;
}

export interface SolidStatus {
  connected: boolean;
  webId: string | null;
  issuer: string | null;
}

export interface GitHubStatus {
  connected: boolean;
  user: GitHubUser | null;
  repo: string | null;
}

export type FediverseVisibility = "public" | "unlisted" | "private" | "direct";
export type MastodonQuotePolicy = "public" | "followers" | "nobody";

export interface MastodonAccount {
  id: string;
  username: string;
  acct: string;
  displayName: string;
  url: string;
  avatar: string;
  note: string;
  followersCount: number;
  followingCount: number;
  group: boolean;
}

export interface MastodonMediaAttachment {
  id: string;
  type: string;
  url: string;
  previewUrl: string | null;
  description: string | null;
  mimeType: string | null;
}

export interface MastodonCreatorAttribution {
  account: MastodonAccount;
  domains: string[];
  tag: string;
}

export interface MastodonCardAuthor {
  name: string;
  url: string;
  account: MastodonAccount | null;
}

export interface MastodonCard {
  url: string;
  title: string;
  description: string;
  image: string | null;
  providerName: string;
  providerUrl: string;
  authors: MastodonCardAuthor[];
  missingAttribution: boolean;
}

export interface MastodonStatus {
  id: string;
  uri: string;
  url: string | null;
  createdAt: string;
  content: string;
  objectType: FediverseObjectType;
  title: string | null;
  contentType: FediverseContentType;
  source: { content: string; mediaType: FediverseContentType } | null;
  filtered: MastodonFilterResult[];
  spoilerText: string;
  language: string | null;
  sensitive: boolean;
  visibility: string;
  account: MastodonAccount;
  mediaAttachments: MastodonMediaAttachment[];
  card: MastodonCard | null;
  favouritesCount: number;
  reblogsCount: number;
  repliesCount: number;
  favourited: boolean;
  reblogged: boolean;
  pinned: boolean;
  inReplyToId: string | null;
  reblog: MastodonStatus | null;
  quote: { state: string; quotedStatus: MastodonStatus | null } | null;
  quoteApproval: { automatic: string[]; manual: string[]; currentUser: string | null } | null;
  quotesCount: number;
}

export interface MastodonSuggestion { source: string; account: MastodonAccount }
export interface MastodonCollectionItem {
  id: string; accountId: string; state: "pending" | "accepted" | "rejected" | "revoked"; createdAt: string;
}
export interface MastodonCollection {
  id: string; accountId: string; uri: string; url: string; name: string; description: string;
  language: string | null; sensitive: boolean; discoverable: boolean; itemCount: number;
  items: MastodonCollectionItem[]; createdAt: string; updatedAt: string;
  sourceUrl: string | null; sourcePage: string | null; sourceKind: string | null;
}

export interface MastodonCollectionSource {
  id: string; name: string; url: string; description: string; importHint: string;
}
export interface MastodonCollectionSourcePreview {
  name: string; description: string; sourceUrl: string; sourcePage: string;
  sourceKind: string; accountCount: number;
}
export interface MastodonCollectionImportResult {
  collections: MastodonCollection[]; sourceUrl: string; accountCount: number;
  failedCount: number; invitationCount: number; addedCount: number; removedCount: number;
  alreadyImported: boolean;
}

export interface MastodonRelationship {
  id: string;
  blocking: boolean;
  muting: boolean;
  mutingNotifications: boolean;
}

export interface MastodonList {
  id: string;
  title: string;
}

export interface CustomFeed {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accounts: string[];
  hashtags: string[];
  semanticKeywords: string[];
  excludeWords: string[];
  excludeAccounts: string[];
  createdAt: string;
  updatedAt: string;
}

export type CustomFeedInput = Omit<CustomFeed, "id" | "createdAt" | "updatedAt">;

export interface MastodonTagHistory {
  day: string;
  uses: string;
  accounts: string;
}

export interface MastodonTag {
  id: string;
  name: string;
  url: string;
  history: MastodonTagHistory[];
  following: boolean;
  featured: boolean;
}

export interface MastodonFeaturedTag {
  id: string;
  name: string;
  url: string;
  statusesCount: number;
  lastStatusAt: string | null;
}

/**
 * Semantic-matching backends a filter keyword can opt into.
 * "local" runs entirely on-device (semantic-filter-service.ts, EmbeddingGemma)
 * — nothing leaves the machine. OpenAI and Gemini send the keyword and
 * candidate text to FediPod's authenticated provider proxy — opt-in per
 * keyword, never the default.
 */
export const SEMANTIC_MODEL_LOCAL = "embeddinggemma-300m";
export const SEMANTIC_MODEL_OPENAI = "openai-text-embedding-3-small";
export const SEMANTIC_MODEL_GEMINI = "gemini-embedding-2";

export interface MastodonFilterKeyword {
  id: string;
  keyword: string;
  wholeWord: boolean;
  /** Ailo/FediPod extension: compare sentence meaning in addition to Mastodon's exact match. */
  semantic: boolean;
  semanticThreshold: number | null;
  /** A supported semantic model identifier, or null (not semantic / unset). */
  semanticModel: string | null;
}

export interface MastodonFilter {
  id: string;
  title: string;
  context: string[];
  expiresAt: string | null;
  action: "warn" | "hide" | "blur";
  keywords: MastodonFilterKeyword[];
}

export interface MastodonFilterResult {
  filter: MastodonFilter;
  keywordMatches: string[];
}

/** One keyword/phrase row on a filter being created or edited — Mastodon's
 * own filters hold several of these per filter; a single `keyword` string
 * on the create call was the whole reason "add multiple keywords" and
 * "edit a filter" didn't work. */
export interface FilterKeywordInput {
  keyword: string;
  wholeWord?: boolean;
  semantic?: boolean;
  semanticThreshold?: number;
  semanticModel?: string;
}

export interface FilterInput {
  title: string;
  action?: "warn" | "hide";
  keywords: FilterKeywordInput[];
}

/* -------------------------------------------------------------------------- */
/*  Ailo/FediPod extension: provider-backed features (/api/v1/ailo/ai/*)      */
/*  Calls happen only in FediPod — Ailo never stores provider API keys.       */
/* -------------------------------------------------------------------------- */

export type AiProvider = "openai" | "gemini";
export interface AiAssistantMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AiAssistantAction {
  type: "custom_feed_draft";
  draft: CustomFeedInput;
}
export type TranslationProvider = AiProvider | "deepl" | "libretranslate";
export type ProviderCredential = AiProvider | "safe_browsing" | "klipy" | "deepl" | "libretranslate";
export type ProviderCredentialSource = "local" | "environment" | null;

export interface ProviderCredentialState {
  configured: boolean;
  source: ProviderCredentialSource;
}

export type ProviderCredentialsStatus = Record<ProviderCredential, ProviderCredentialState>;

export interface ProviderCredentialTestResult {
  ok: true;
  provider: ProviderCredential;
  model?: string;
}

export interface AiStatus {
  /** Whether the connected FediPod agent has at least one provider key configured. */
  enabled: boolean;
  providers: AiProvider[];
  defaultProvider: AiProvider | null;
  models: Partial<Record<AiProvider, string>>;
  safeBrowsingEnabled: boolean;
  klipyEnabled: boolean;
  translationProviders: TranslationProvider[];
  defaultTranslationProvider: TranslationProvider | null;
}

export interface TranslationSettings {
  provider: TranslationProvider | null;
  libreTranslateUrl: string;
  autoTranslate: boolean;
  targetLanguage: string;
  configuredProviders: TranslationProvider[];
}

export interface KlipyGif {
  id: string;
  title: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

export interface SafeBrowsingThreat {
  url: string;
  threatTypes: string[];
}

export interface SafeBrowsingResult {
  safe: boolean;
  threats: SafeBrowsingThreat[];
  checkedUrls: string[];
  cached: boolean;
}

export interface AiKeywordSuggestion {
  keyword: string;
  reason: string;
}
export interface AiDomainSuggestion {
  domain: string;
  reason: string;
}
export interface AiAccountSuggestion {
  acct: string;
  reason: string;
}

export interface AiModerationSuggestions {
  keywords: AiKeywordSuggestion[];
  domains: AiDomainSuggestion[];
  accounts: AiAccountSuggestion[];
}

/** The Safety page's weekly moderation summary — a mix of live totals
 * FediPod holds, "new this week" deltas Ailo tracks locally, and content
 * FediPod refused before delivery because of a block. */
export interface ModerationStatsBundle {
  blockedAccounts: number;
  newBlockedAccounts: number;
  mutedAccounts: number;
  newMutedAccounts: number;
  blockedDomains: number;
  newBlockedDomains: number;
  activeFilters: number;
  activeKeywords: number;
  filteredPosts: number;
  intakeBlockedPosts: number;
  /** filteredPosts + intakeBlockedPosts, for the single 7-day window immediately
   * before this one — the trend arrow's comparison point, not a delta. */
  previousWeekContentBlocked: number;
  topDomains: ModerationDomainBreakdown[];
  topFilters: ModerationFilterBreakdown[];
}

export interface ModerationDomainBreakdown {
  domain: string;
  count: number;
}
export interface ModerationFilterBreakdown {
  title: string;
  count: number;
}

export interface AiFilterMatchQuery {
  id: string;
  text: string;
  /** Falls back to FediPod's own default when omitted. */
  threshold?: number;
}
export interface AiFilterMatchDocument {
  id: string;
  text: string;
}
export interface AiFilterMatch {
  queryId: string;
  documentId: string;
}

export type FediverseObjectType = "Note" | "Article";
export type FediverseContentType = "text/plain" | "text/markdown" | "text/x.misskeymarkdown";

export interface FediPodCapabilities {
  objectTypes: FediverseObjectType[];
  contentTypes: FediverseContentType[];
  maxTitleCharacters: number;
  maxPinnedStatuses: number;
  supportsCommunityTargeting: boolean;
  compatibility: FediPodCompatibility;
}

export interface FediPodCompatibility {
  apiVersion: number;
  minAiloApiVersion: number;
  fedipodVersion: string;
  features: string[];
}

export interface MastodonNotification {
  id: string;
  type: string;
  createdAt: string;
  account: MastodonAccount;
  status: MastodonStatus | null;
  collection: MastodonCollection | null;
}

export interface FediPodStatus {
  connected: boolean;
  baseUrl: string;
  account: MastodonAccount | null;
}

/**
 * Result of the one-click OAuth login against FediPod's `/oauth/authorize`.
 * `password_required` means the agent has a UI password set and none (or the
 * wrong one) was supplied — the caller should prompt and retry.
 */
export type FediPodLoginResult =
  | { status: "connected"; account: MastodonAccount }
  | { status: "password_required" };

export interface PublishResults {
  solid?: { ok: true; url: string } | { ok: false; error: string };
  github?: { ok: true; path: string; htmlUrl: string } | { ok: false; error: string };
  fediverse?: { ok: true; url: string | null } | { ok: false; error: string };
}
