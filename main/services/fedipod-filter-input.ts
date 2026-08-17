import { t } from "./i18n.js";
import type { FilterKeywordInput } from "../types.js";
import { SEMANTIC_MODEL_GEMINI, SEMANTIC_MODEL_LOCAL, SEMANTIC_MODEL_OPENAI } from "../types.js";

// Pure validation, no @glaze/core/backend import — kept separate from
// main/handlers/fedipod.ts (which does import it, for ipcMain) so this is
// actually unit-testable without an Electron runtime, the same shape
// fedipod-compatibility.ts already uses for the same reason.
export const SEMANTIC_MODELS = [SEMANTIC_MODEL_LOCAL, SEMANTIC_MODEL_OPENAI, SEMANTIC_MODEL_GEMINI];

// A filter needs at least one keyword row — Mastodon's own filters allow
// several, which single-`keyword` createFilter never let this client send.
// semanticModel is validated against the three supported values and passed
// through as given: this used to be hardcoded to SEMANTIC_MODEL_LOCAL
// regardless of what the client sent, so picking OpenAI or Gemini as a
// filter's semantic backend silently did nothing — the filter was always
// stored (and always matched, in semantic-filter-service.ts's apply())
// as local EmbeddingGemma.
export function requireFilterKeywords(value: unknown): FilterKeywordInput[] {
  const rows = Array.isArray(value) ? value : [];
  const keywords = rows
    .map((row) => (typeof row === "object" && row !== null ? row as Record<string, unknown> : {}))
    .filter((row) => typeof row.keyword === "string" && row.keyword.trim())
    .map((row): FilterKeywordInput => ({
      keyword: (row.keyword as string).trim(),
      wholeWord: row.wholeWord === true,
      semantic: row.semantic !== false,
      semanticThreshold: typeof row.semanticThreshold === "number"
        ? Math.min(0.9, Math.max(0.3, row.semanticThreshold)) : 0.6,
      semanticModel: typeof row.semanticModel === "string" && SEMANTIC_MODELS.includes(row.semanticModel)
        ? row.semanticModel : SEMANTIC_MODEL_LOCAL,
    }));
  if (!keywords.length) throw new Error(t("backendFedipod.filterKeywordsRequired"));
  return keywords;
}
