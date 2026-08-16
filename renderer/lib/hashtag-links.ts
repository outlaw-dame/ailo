const TAG_PATTERN = /^(?=.*[\p{L}\p{M}_])[\p{L}\p{M}\p{N}_]+$/u;

export function normalizeLinkedHashtag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().replace(/^#/, "").normalize("NFC").toLowerCase();
  return tag && [...tag].length <= 100 && TAG_PATTERN.test(tag) ? tag : null;
}

export function hashtagFromLink(input: {
  href?: string | null;
  dataHashtag?: string | null;
}): string | null {
  const explicit = normalizeLinkedHashtag(input.dataHashtag);
  if (explicit) return explicit;
  if (!input.href) return null;
  try {
    const url = new URL(input.href, "https://ailo.invalid");
    const match = /\/tags\/([^/]+)\/?$/u.exec(url.pathname);
    return match ? normalizeLinkedHashtag(decodeURIComponent(match[1])) : null;
  } catch {
    return null;
  }
}
