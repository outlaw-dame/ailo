/** Shared domain types for Ailo. */

export interface ImageAltText {
  /** Stable key: image URL or markdown src */
  src: string;
  alt: string;
}

export interface Post {
  id: string;
  title: string;
  /** Markdown body (may embed HTML + emoji) */
  body: string;
  /** Optional content-warning summary shown before reveal */
  contentWarning: string | null;
  /** Per-image alt text overrides */
  altTexts: ImageAltText[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Solid Pod resource URL after successful publish */
  solidUrl: string | null;
  /** GitHub blob/file path after successful publish */
  githubPath: string | null;
  status: "draft" | "published";
}

export interface Profile {
  displayName: string;
  bio: string;
  /** Cal.com username or full booking path, e.g. "jane" or "jane/30min" */
  calComPath: string;
  /** Preferred Solid OIDC issuer, e.g. https://login.inrupt.com */
  solidIssuer: string;
  /** Preferred Solid Pod root URL */
  solidPodRoot: string;
  /** Connected GitHub login */
  githubLogin: string | null;
  /** Connected GitHub repo full name owner/name */
  githubRepo: string | null;
  /** Connected Solid WebID */
  solidWebId: string | null;
  /** Credit the connected Fediverse account as content creator (fediverse:creator) on publish */
  fediverseCreatorEnabled: boolean;
}

export interface PostsFile {
  version: 1;
  posts: Post[];
}

export interface SolidSessionSnapshot {
  webId: string;
  issuer: string;
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: number;
  dpopPrivateJwk: Record<string, unknown>;
  dpopPublicJwk: Record<string, unknown>;
  tokenEndpoint: string;
  authorizationEndpoint: string;
  registrationEndpoint: string | null;
  endSessionEndpoint: string | null;
}

export const DEFAULT_PROFILE: Profile = {
  displayName: "",
  bio: "",
  calComPath: "",
  solidIssuer: "https://login.inrupt.com",
  solidPodRoot: "",
  githubLogin: null,
  githubRepo: null,
  solidWebId: null,
  fediverseCreatorEnabled: true,
};

/* -------------------------------------------------------------------------- */
/*  FediPod / Fediverse (Mastodon client API)                                 */
/* -------------------------------------------------------------------------- */

/** Mastodon status visibility. */
export type FediverseVisibility = "public" | "unlisted" | "private" | "direct";
export type MastodonQuotePolicy = "public" | "followers" | "nobody";

export interface MastodonAccount {
  id: string;
  username: string;
  /** webfinger handle, e.g. "ada@pod.example" */
  acct: string;
  displayName: string;
  url: string;
  avatar: string;
  note: string;
  followersCount: number;
  followingCount: number;
  /** FediPod extension: the ActivityPub actor has type Group. */
  group: boolean;
}

export interface MastodonMediaAttachment {
  id: string;
  type: string;
  url: string;
  previewUrl: string | null;
  /** Alt text */
  description: string | null;
}

export interface MastodonCreatorAttribution {
  account: MastodonAccount;
  domains: string[];
  tag: string;
}

/** An author credited via a linked page's fediverse:creator meta tag. */
export interface MastodonCardAuthor {
  name: string;
  url: string;
  account: MastodonAccount | null;
}

/** Link preview card for a shared URL, including fediverse:creator attribution. */
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
  /** HTML content (sanitize before rendering) */
  content: string;
  objectType: FediverseObjectType;
  title: string | null;
  contentType: FediverseContentType;
  source: { content: string; mediaType: FediverseContentType } | null;
  filtered: MastodonFilterResult[];
  /** Content warning */
  spoilerText: string;
  visibility: string;
  account: MastodonAccount;
  mediaAttachments: MastodonMediaAttachment[];
  /** Link preview for a shared URL, if any (may carry fediverse:creator authors) */
  card: MastodonCard | null;
  favouritesCount: number;
  reblogsCount: number;
  repliesCount: number;
  favourited: boolean;
  reblogged: boolean;
  pinned: boolean;
  inReplyToId: string | null;
  /** Present when this status boosts another */
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
 * Semantic-matching backends a filter keyword can opt into.
 * "local" runs entirely on-device (renderer/lib/semantic-filter-service.ts,
 * EmbeddingGemma) — nothing leaves the machine. OpenAI and Gemini send the
 * keyword and candidate text to FediPod's authenticated provider proxy —
 * opt-in per keyword, never the default.
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

/* -------------------------------------------------------------------------- */
/*  Ailo/FediPod extension: provider-backed features (/api/v1/ailo/ai/*)      */
/*  Calls happen only in FediPod — Ailo never stores provider API keys.       */
/* -------------------------------------------------------------------------- */

export type AiProvider = "openai" | "gemini";

export interface AiStatus {
  /** Whether the connected FediPod agent has at least one provider key configured. */
  enabled: boolean;
  providers: AiProvider[];
  defaultProvider: AiProvider | null;
  models: Partial<Record<AiProvider, string>>;
  safeBrowsingEnabled: boolean;
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
  /** Includes Mastodon quote and Collection notification types. */
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

export interface FediPodConfig {
  version: 1;
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

export const DEFAULT_FEDIPOD_CONFIG: FediPodConfig = {
  version: 1,
  baseUrl: "",
  account: null,
};
