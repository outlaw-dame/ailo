import DOMPurify from "dompurify";
import { marked } from "marked";

import i18n from "./i18n";
import { renderMfm } from "./mfm";
import type { ImageAltText, MastodonStatus } from "./types";

marked.setOptions({
  gfm: true,
  breaks: true,
});

/** Extract markdown image sources for alt-text management. */
export function extractImageSources(markdown: string): string[] {
  const sources: string[] = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    if (!sources.includes(match[1])) sources.push(match[1]);
  }
  const htmlRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlRe.exec(markdown)) !== null) {
    if (!sources.includes(match[1])) sources.push(match[1]);
  }
  return sources;
}

/** First image URL in a note — used for Paper-style cover art. */
export function firstImageSrc(markdown: string): string | null {
  return extractImageSources(markdown)[0] ?? null;
}

/** Stable 0–3 mesh index from an id (cover art without photos). */
export function meshIndexForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 4;
}

function applyAltTexts(html: string, altTexts: ImageAltText[]): string {
  let result = html;
  for (const entry of altTexts) {
    if (!entry.alt) continue;
    const escaped = entry.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`(<img\\b[^>]*\\bsrc=["']${escaped}["'][^>]*?)\\balt=["'][^"']*["']`, "gi"),
      `$1alt="${entry.alt.replace(/"/g, "&quot;")}"`,
    );
    result = result.replace(
      new RegExp(`(<img\\b(?![^>]*\\balt=)[^>]*\\bsrc=["']${escaped}["'][^>]*)(/?>)`, "gi"),
      `$1 alt="${entry.alt.replace(/"/g, "&quot;")}"$2`,
    );
  }
  return result;
}

export function renderMarkdown(markdown: string, altTexts: ImageAltText[] = []): string {
  const raw = marked.parse(markdown ?? "", { async: false }) as string;
  const withAlt = applyAltTexts(raw, altTexts);
  return DOMPurify.sanitize(withAlt, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  });
}

/** Sanitize externally-sourced HTML (e.g. Mastodon status content) for rendering. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html ?? "", {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  });
}

export function renderFediverseContent(status: MastodonStatus): string {
  const source = status.source?.content;
  if (source && status.contentType === "text/x.misskeymarkdown") {
    return sanitizeHtml(renderMfm(source));
  }
  if (source && status.contentType === "text/markdown") return renderMarkdown(source);
  return sanitizeHtml(status.content);
}

export function excerptFromBody(body: string, max = 160): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return i18n.t("time.justNow");
  if (minutes < 60) return i18n.t("time.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return i18n.t("time.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return i18n.t("time.daysAgo", { count: days });
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function formatLongDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
