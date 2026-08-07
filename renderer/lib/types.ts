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

export interface PublishResults {
  solid?: { ok: true; url: string } | { ok: false; error: string };
  github?: { ok: true; path: string; htmlUrl: string } | { ok: false; error: string };
}
