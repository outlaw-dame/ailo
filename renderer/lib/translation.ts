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
    // A LOT of fediverse posts never declare a language at all — plenty of
    // software posting to ActivityPub just doesn't set it. Auto-translate
    // used to treat "unknown" the same as "definitely a different
    // language", which meant untagged posts already in the reader's own
    // language got auto-translated anyway, since there was nothing to
    // compare against. Requiring a real, recognized source language makes
    // "we don't know" the safe default of doing nothing automatically —
    // the manual Translate button still works on an unknown-language post,
    // this only gates the *automatic* one.
    && baseLanguage(input.sourceLanguage) !== null
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
