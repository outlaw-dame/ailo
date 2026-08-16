export const AUTO_TRANSLATE_MAX_CHARACTERS = 500;

export function baseLanguage(language: string | null | undefined): string | null {
  const normalized = language?.trim().toLowerCase().replace("_", "-");
  return normalized ? normalized.split("-")[0] || null : null;
}

export function isSameLanguage(source: string | null | undefined, target: string): boolean {
  const sourceBase = baseLanguage(source);
  return sourceBase !== null && sourceBase === baseLanguage(target);
}

export function canAutoTranslatePost(input: {
  textLength: number;
  sourceLanguage?: string | null;
  targetLanguage: string;
  hasContentWarning: boolean;
  sensitive: boolean;
  hasMedia: boolean;
  hasCard: boolean;
  isArticle: boolean;
  hasFilterWarning: boolean;
}): boolean {
  return input.textLength > 0
    && input.textLength <= AUTO_TRANSLATE_MAX_CHARACTERS
    && !isSameLanguage(input.sourceLanguage, input.targetLanguage)
    && !input.hasContentWarning
    && !input.sensitive
    && !input.hasMedia
    && !input.hasCard
    && !input.isArticle
    && !input.hasFilterWarning;
}

export function languageName(language: string | null | undefined): string | null {
  const code = baseLanguage(language);
  if (!code) return null;
  try {
    return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
