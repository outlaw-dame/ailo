import type { Post } from "../types.js";
import { fediPodService } from "./fedipod-service.js";
import { profileStore } from "./profile-store.js";
import { solidOAuth } from "./solid-oauth.js";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "post"
  );
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function postToMarkdown(post: Post, creatorHandle: string | null): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(post.title)}`,
    `date: ${post.publishedAt ?? post.updatedAt}`,
    `id: ${post.id}`,
    post.contentWarning ? `content_warning: ${JSON.stringify(post.contentWarning)}` : null,
    // Lets a static-site template emit <meta name="fediverse:creator"> so links
    // shared to Mastodon credit this author (Mastodon's creator-tag feature).
    creatorHandle ? `fediverse_creator: ${JSON.stringify(`@${creatorHandle}`)}` : null,
    post.tags.length > 0
      ? `tags: [${post.tags.map((tag) => JSON.stringify(tag)).join(", ")}]`
      : null,
    "---",
    "",
    post.body,
    "",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

/**
 * Resolve a writable container for Ailo posts.
 * Preference order: user-configured pod root → WebID profile storage hint → WebID origin /public/
 */
async function resolvePostsContainer(): Promise<string> {
  const profile = await profileStore.get();
  if (profile.solidPodRoot.trim()) {
    return ensureTrailingSlash(`${ensureTrailingSlash(profile.solidPodRoot.trim())}ailo/posts`);
  }

  const session = await solidOAuth.getSession();
  if (!session.webId) throw new Error("Solid is not connected");

  // Try to read pim:storage from the WebID profile document.
  try {
    const response = await solidOAuth.authorizedFetch(session.webId, {
      headers: { Accept: "text/turtle" },
    });
    if (response.ok) {
      const turtle = await response.text();
      const match =
        turtle.match(/<([^>]+)>\s+;?\s*pim:storage\s+<([^>]+)>/i) ??
        turtle.match(/pim:storage\s+<([^>]+)>/i);
      const storage = match?.[2] ?? match?.[1];
      if (storage) {
        return ensureTrailingSlash(`${ensureTrailingSlash(storage)}ailo/posts`);
      }
    }
  } catch {
    // Fall through to origin-based default.
  }

  const origin = new URL(session.webId).origin;
  return ensureTrailingSlash(`${origin}/public/ailo/posts`);
}

async function ensureContainer(containerUrl: string): Promise<void> {
  const head = await solidOAuth.authorizedFetch(containerUrl, { method: "HEAD" });
  if (head.ok) return;

  // Create intermediate segments one by one.
  const url = new URL(containerUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  let cursor = `${url.origin}/`;
  for (const segment of segments) {
    cursor = `${cursor}${segment}/`;
    const existing = await solidOAuth.authorizedFetch(cursor, { method: "HEAD" });
    if (existing.ok) continue;
    const created = await solidOAuth.authorizedFetch(cursor, {
      method: "PUT",
      headers: {
        "Content-Type": "text/turtle",
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
      },
      body: "",
    });
    // Some servers prefer POST to parent with slug; try that on 4xx.
    if (!created.ok && created.status >= 400 && created.status < 500) {
      const parent = cursor.replace(/[^/]+\/$/, "");
      const slug = segment;
      await solidOAuth.authorizedFetch(parent, {
        method: "POST",
        headers: {
          "Content-Type": "text/turtle",
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          slug,
        },
        body: "",
      });
    }
  }
}

class SolidService {
  async connect(issuer?: string): Promise<{ webId: string; issuer: string }> {
    return solidOAuth.authorize(issuer);
  }

  async disconnect(): Promise<void> {
    await solidOAuth.disconnect();
  }

  async getStatus(): Promise<{ connected: boolean; webId: string | null; issuer: string | null }> {
    return solidOAuth.getSession();
  }

  async publishPost(post: Post): Promise<{ url: string }> {
    const container = await resolvePostsContainer();
    await ensureContainer(container);

    const profile = await profileStore.get();
    const creatorHandle = profile.fediverseCreatorEnabled
      ? await fediPodService.creatorHandle()
      : null;
    const date = (post.publishedAt ?? post.updatedAt).slice(0, 10);
    const filename = `${date}-${slugify(post.title)}-${post.id.slice(0, 8)}.md`;
    const resourceUrl = new URL(filename, container).toString();
    const body = postToMarkdown(post, creatorHandle);

    const response = await solidOAuth.authorizedFetch(resourceUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Solid publish failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ""}`,
      );
    }

    // Remember pod root if user had not set one.
    if (!profile.solidPodRoot) {
      const root = container.replace(/ailo\/posts\/?$/, "");
      await profileStore.update({ solidPodRoot: root });
    }

    return { url: resourceUrl };
  }
}

export const solidService = new SolidService();
