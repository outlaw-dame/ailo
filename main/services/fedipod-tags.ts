import type { MastodonFeaturedTag, MastodonTag } from "../types.js";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

export function normalizeHashtag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().replace(/^#/, "").normalize("NFC").toLowerCase();
  return tag && [...tag].length <= 100
    && /^(?=.*[\p{L}\p{M}_])[\p{L}\p{M}\p{N}_]+$/u.test(tag) ? tag : null;
}

export function mapTag(raw: unknown): MastodonTag {
  const source = record(raw);
  return {
    id: text(source.id) || text(source.name),
    name: text(source.name),
    url: text(source.url),
    history: (Array.isArray(source.history) ? source.history : []).map((value) => {
      const row = record(value);
      return { day: text(row.day), uses: text(row.uses, "0"), accounts: text(row.accounts, "0") };
    }),
    following: source.following === true,
    featured: source.featured === true,
  };
}

export function mapFeaturedTag(raw: unknown): MastodonFeaturedTag {
  const source = record(raw);
  return {
    id: text(source.id), name: text(source.name), url: text(source.url),
    statusesCount: Number.parseInt(text(source.statuses_count, "0"), 10) || 0,
    lastStatusAt: typeof source.last_status_at === "string" ? source.last_status_at : null,
  };
}
