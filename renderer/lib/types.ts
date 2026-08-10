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
 * The two semantic-matching backends a filter keyword can opt into.
 * "local" runs entirely on-device (semantic-filter-service.ts, EmbeddingGemma)
 * — nothing leaves the machine. "openai" sends the keyword and candidate
 * status text to FediPod's /api/v1/ailo/ai/filters/match, which calls
 * OpenAI's embeddings API — opt-in per keyword, never the default.
 */
export const SEMANTIC_MODEL_LOCAL = "embeddinggemma-300m";
export const SEMANTIC_MODEL_OPENAI = "openai-text-embedding-3-small";

export interface MastodonFilterKeyword {
  id: string;
  keyword: string;
  wholeWord: boolean;
  /** Ailo/FediPod extension: compare sentence meaning in addition to Mastodon's exact match. */
  semantic: boolean;
  semanticThreshold: number | null;
  /** SEMANTIC_MODEL_LOCAL, SEMANTIC_MODEL_OPENAI, or null (not semantic / unset). */
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

/* -------------------------------------------------------------------------- */
/*  Ailo/FediPod extension: OpenAI-backed features (/api/v1/ailo/ai/*)        */
/*  Calls happen only in FediPod — Ailo never stores an OpenAI key.           */
/* -------------------------------------------------------------------------- */

export interface AiStatus {
  /** Whether the connected FediPod agent has AP_OPENAI_API_KEY configured. */
  enabled: boolean;
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
