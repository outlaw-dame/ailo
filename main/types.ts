/** Shared domain types for Knot. */

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
