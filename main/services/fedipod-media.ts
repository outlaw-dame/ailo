import type { MastodonMediaAttachment } from "../types.js";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function mapMediaAttachment(raw: unknown): MastodonMediaAttachment {
  const source = record(raw);
  return {
    id: string(source.id),
    type: string(source.type) || "unknown",
    url: string(source.url) || string(source.remote_url) || string(source.preview_url),
    previewUrl: string(source.preview_url) || null,
    description: typeof source.description === "string" ? source.description : null,
    mimeType: typeof source.mime_type === "string"
      && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(source.mime_type)
      ? source.mime_type.toLowerCase() : null,
  };
}
