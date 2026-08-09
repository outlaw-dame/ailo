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
}

export interface MastodonMediaAttachment {
  id: string;
  type: string;
  url: string;
  previewUrl: string | null;
  description: string | null;
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
  authors: MastodonCardAuthor[];
}

export interface MastodonStatus {
  id: string;
  uri: string;
  url: string | null;
  createdAt: string;
  content: string;
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
  inReplyToId: string | null;
  reblog: MastodonStatus | null;
}

export interface MastodonNotification {
  id: string;
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

export interface PublishResults {
  solid?: { ok: true; url: string } | { ok: false; error: string };
  github?: { ok: true; path: string; htmlUrl: string } | { ok: false; error: string };
  fediverse?: { ok: true; url: string | null } | { ok: false; error: string };
}
