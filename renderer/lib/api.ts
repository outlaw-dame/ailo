import type {
  GitHubRepoSummary,
  GitHubStatus,
  ImageAltText,
  Post,
  Profile,
  PublishResults,
  SolidStatus,
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
    update: (patch: Partial<Profile>) =>
      ipc().invoke("profile:update", patch) as Promise<Profile>,
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
};
