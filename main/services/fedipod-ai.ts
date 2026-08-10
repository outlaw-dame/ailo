import type {
  AiAccountSuggestion,
  AiDomainSuggestion,
  AiFilterMatch,
  AiKeywordSuggestion,
  AiModerationSuggestions,
  AiStatus,
} from "../types.js";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function mapAiStatus(raw: unknown): AiStatus {
  return { enabled: record(raw).enabled === true };
}

export function mapHashtagSuggestions(raw: unknown): string[] {
  return arr(record(raw).hashtags).filter((value): value is string => typeof value === "string");
}

function mapKeywordSuggestion(raw: unknown): AiKeywordSuggestion | null {
  const source = record(raw);
  const keyword = text(source.keyword);
  const reason = text(source.reason);
  return keyword && reason ? { keyword, reason } : null;
}
function mapDomainSuggestion(raw: unknown): AiDomainSuggestion | null {
  const source = record(raw);
  const domain = text(source.domain);
  const reason = text(source.reason);
  return domain && reason ? { domain, reason } : null;
}
function mapAccountSuggestion(raw: unknown): AiAccountSuggestion | null {
  const source = record(raw);
  const acct = text(source.acct);
  const reason = text(source.reason);
  return acct && reason ? { acct, reason } : null;
}

export function mapModerationSuggestions(raw: unknown): AiModerationSuggestions {
  const source = record(raw);
  return {
    keywords: arr(source.keywords)
      .map(mapKeywordSuggestion)
      .filter((entry): entry is AiKeywordSuggestion => entry !== null),
    domains: arr(source.domains)
      .map(mapDomainSuggestion)
      .filter((entry): entry is AiDomainSuggestion => entry !== null),
    accounts: arr(source.accounts)
      .map(mapAccountSuggestion)
      .filter((entry): entry is AiAccountSuggestion => entry !== null),
  };
}

export function mapFilterMatches(raw: unknown): AiFilterMatch[] {
  return arr(record(raw).matches)
    .map((entry) => {
      const source = record(entry);
      const queryId = text(source.queryId);
      const documentId = text(source.documentId);
      return queryId && documentId ? { queryId, documentId } : null;
    })
    .filter((entry): entry is AiFilterMatch => entry !== null);
}

export function mapTranslation(raw: unknown): string {
  return text(record(raw).translated);
}
