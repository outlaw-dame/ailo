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
};

/* -------------------------------------------------------------------------- */
/*  FediPod / Fediverse (Mastodon client API)                                 */
/* -------------------------------------------------------------------------- */

/** Mastodon status visibility. */
export type FediverseVisibility = "public" | "unlisted" | "private" | "direct";

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
  favouritesCount: number;
  reblogsCount: number;
  repliesCount: number;
  favourited: boolean;
  reblogged: boolean;
  inReplyToId: string | null;
  /** Present when this status boosts another */
  reblog: MastodonStatus | null;
}

export interface MastodonRelationship {
  id: string;
  blocking: boolean;
  muting: boolean;
  mutingNotifications: boolean;
}

export interface MastodonFilterKeyword {
  id: string;
  keyword: string;
  wholeWord: boolean;
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

export type FediverseObjectType = "Note" | "Article";
export type FediverseContentType = "text/plain" | "text/markdown" | "text/x.misskeymarkdown";

export interface FediPodCapabilities {
  objectTypes: FediverseObjectType[];
  contentTypes: FediverseContentType[];
  maxTitleCharacters: number;
  supportsCommunityTargeting: boolean;
}

export interface MastodonNotification {
  id: string;
  /** mention | reblog | favourite | follow | poll | status | update */
  type: string;
  createdAt: string;
  account: MastodonAccount;
  status: MastodonStatus | null;
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
