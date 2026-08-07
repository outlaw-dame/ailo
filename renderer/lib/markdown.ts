import DOMPurify from "dompurify";
import { marked } from "marked";

import type { ImageAltText } from "./types";

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
  // HTML <img src="...">
  const htmlRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlRe.exec(markdown)) !== null) {
    if (!sources.includes(match[1])) sources.push(match[1]);
  }
  return sources;
}

function applyAltTexts(html: string, altTexts: ImageAltText[]): string {
  let result = html;
  for (const entry of altTexts) {
    if (!entry.alt) continue;
    const escaped = entry.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Replace empty or existing alt on matching src
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

export function excerptFromBody(body: string, max = 140): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "$1")
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
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
