import type { Post } from "../types.js";
import { githubOAuth } from "./github-oauth.js";
import { profileStore } from "./profile-store.js";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

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

export interface PublishResult {
  path: string;
  htmlUrl: string;
  commitSha: string | null;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "post"
  );
}

function postToMarkdown(post: Post): string {
  const tags = post.tags.length > 0 ? post.tags.join(", ") : "";
  const altBlock =
    post.altTexts.length > 0
      ? post.altTexts.map((entry) => `- ${entry.src}: ${entry.alt}`).join("\n")
      : "";
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(post.title)}`,
    `date: ${post.publishedAt ?? post.updatedAt}`,
    `id: ${post.id}`,
    post.contentWarning ? `content_warning: ${JSON.stringify(post.contentWarning)}` : null,
    tags ? `tags: [${post.tags.map((tag) => JSON.stringify(tag)).join(", ")}]` : null,
    altBlock
      ? `alt_texts: |\n${altBlock
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}`
      : null,
    "---",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  let body = post.body;
  for (const entry of post.altTexts) {
    if (!entry.alt) continue;
    const escaped = entry.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(
      new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`, "g"),
      `![${entry.alt}](${entry.src})`,
    );
  }
  return `${frontmatter}${body}\n`;
}

class GitHubService {
  private async token(): Promise<string> {
    const accessToken = await githubOAuth.getAccessToken();
    if (!accessToken) throw new Error("GitHub is not connected. Connect GitHub in Profile.");
    return accessToken;
  }

  private async request<T>(path: string, init: FetchInit = {}): Promise<T> {
    const token = await this.token();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-GitHub-Api-Version", API_VERSION);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API}${path}`, { ...init, headers });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `GitHub API ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 280)}` : ""}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async connect(): Promise<GitHubUser> {
    await githubOAuth.authorize();
    return this.getViewer();
  }

  async disconnect(): Promise<void> {
    await githubOAuth.removeTokens();
    await profileStore.update({ githubLogin: null, githubRepo: null });
  }

  async isConnected(): Promise<boolean> {
    try {
      const token = await githubOAuth.getAccessToken();
      return Boolean(token);
    } catch {
      return false;
    }
  }

  async getViewer(): Promise<GitHubUser> {
    const data = await this.request<{
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
    }>("/user");
    const user: GitHubUser = {
      login: data.login,
      name: data.name,
      avatarUrl: data.avatar_url,
      htmlUrl: data.html_url,
    };
    await profileStore.update({ githubLogin: user.login });
    return user;
  }

  async listRepos(): Promise<GitHubRepoSummary[]> {
    const data = await this.request<
      Array<{
        name: string;
        full_name: string;
        html_url: string;
        private: boolean;
        default_branch: string;
      }>
    >("/user/repos?per_page=100&sort=updated");
    return data.map((repo) => ({
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      private: repo.private,
      defaultBranch: repo.default_branch,
    }));
  }

  async createRepo(name: string, isPrivate = false): Promise<GitHubRepoSummary> {
    const clean = name.trim().replace(/\s+/g, "-").toLowerCase() || "ailo-blog";
    const data = await this.request<{
      name: string;
      full_name: string;
      html_url: string;
      private: boolean;
      default_branch: string;
    }>("/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: clean,
        description: "Knowledge shared with Ailo — decentralized notes published as Markdown",
        private: isPrivate,
        auto_init: true,
        has_issues: false,
        has_projects: false,
        has_wiki: false,
      }),
    });
    const repo: GitHubRepoSummary = {
      name: data.name,
      fullName: data.full_name,
      htmlUrl: data.html_url,
      private: data.private,
      defaultBranch: data.default_branch || "main",
    };
    await profileStore.update({ githubRepo: repo.fullName });
    return repo;
  }

  async setActiveRepo(fullName: string): Promise<void> {
    if (!fullName.includes("/")) throw new Error("Repository must be owner/name");
    await profileStore.update({ githubRepo: fullName });
  }

  async publishPost(post: Post): Promise<PublishResult> {
    const profile = await profileStore.get();
    if (!profile.githubRepo) {
      throw new Error("No GitHub repository selected. Create or choose one in Profile.");
    }
    const [owner, repo] = profile.githubRepo.split("/");
    if (!owner || !repo) throw new Error(`Invalid repository: ${profile.githubRepo}`);

    const date = (post.publishedAt ?? post.updatedAt).slice(0, 10);
    const filePath = `posts/${date}-${slugify(post.title)}-${post.id.slice(0, 8)}.md`;
    const content = Buffer.from(postToMarkdown(post), "utf-8").toString("base64");
    const message = post.githubPath ? `Update post: ${post.title}` : `Publish post: ${post.title}`;

    let sha: string | undefined;
    try {
      const existing = await this.request<{ sha: string }>(
        `/repos/${owner}/${repo}/contents/${encodeURI(filePath)}`,
      );
      sha = existing.sha;
    } catch {
      // File does not exist yet — create.
    }

    const result = await this.request<{
      content: { path: string; html_url: string; sha: string };
      commit: { sha: string };
    }>(`/repos/${owner}/${repo}/contents/${encodeURI(filePath)}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content,
        sha,
        committer: {
          name: "Ailo",
          email: "ailo@users.noreply.github.com",
        },
      }),
    });

    return {
      path: result.content.path,
      htmlUrl: result.content.html_url,
      commitSha: result.commit?.sha ?? null,
    };
  }
}

export const githubService = new GitHubService();
