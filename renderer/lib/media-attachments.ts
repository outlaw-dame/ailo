export type SupportedMediaKind = "image" | "gif" | "video" | "audio";

export const MEDIA_UPLOAD_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 40 * 1024 * 1024,
  audio: 40 * 1024 * 1024,
} as const;

export const SUPPORTED_UPLOAD_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
  "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-matroska",
  "audio/mpeg", "audio/ogg", "audio/webm", "audio/flac", "audio/wav",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif", gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg",
  png: "image/png", webp: "image/webp", mkv: "video/x-matroska", mov: "video/quicktime",
  mp4: "video/mp4", ogv: "video/ogg", webm: "video/webm", flac: "audio/flac",
  mp3: "audio/mpeg", oga: "audio/ogg", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav",
};

export function mediaMimeType(mimeType: string | null | undefined, url: string): string | null {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (normalized && SUPPORTED_UPLOAD_MEDIA_TYPES.has(normalized)) return normalized;
  try {
    const extension = new URL(url, "https://media.invalid").pathname.split(".").pop()?.toLowerCase() ?? "";
    return MIME_BY_EXTENSION[extension] ?? null;
  } catch {
    return null;
  }
}

export function mediaFormatLabel(mimeType: string | null): string | null {
  return ({
    "video/webm": "WebM", "video/ogg": "Ogg video", "video/x-matroska": "Matroska",
    "video/mp4": "MP4", "video/quicktime": "QuickTime",
  } as Record<string, string>)[mimeType ?? ""] ?? null;
}

export function supportedMediaKind(type: string): SupportedMediaKind | null {
  if (type === "image") return "image";
  if (type === "gifv") return "gif";
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  return null;
}
