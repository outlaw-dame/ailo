import type {
  AiAccountSuggestion,
  AiDomainSuggestion,
  AiFilterMatch,
  AiKeywordSuggestion,
  AiModerationSuggestions,
  AiProvider,
  AiStatus,
  SafeBrowsingResult,
} from "../types.js";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function mapAiStatus(raw: unknown): AiStatus {
  const source = record(raw);
  const mappedProviders = arr(source.providers)
    .filter((value): value is AiProvider => value === "openai" || value === "gemini");
  // Older FediPod builds exposed only `{ enabled }`; preserve that OpenAI
  // capability while newer builds return an explicit provider inventory.
  const providers = mappedProviders.length || source.enabled !== true ? mappedProviders : ["openai" as const];
  const configuredDefault = source.default_provider;
  const defaultProvider =
    (configuredDefault === "openai" || configuredDefault === "gemini")
    && providers.includes(configuredDefault) ? configuredDefault : providers[0] ?? null;
  const models = record(source.models);
  const safeBrowsing = record(source.safe_browsing);
  return {
    enabled: source.enabled === true && providers.length > 0,
    providers,
    defaultProvider,
    models: {
      ...(providers.includes("openai") && text(models.openai) ? { openai: text(models.openai) } : {}),
      ...(providers.includes("gemini") && text(models.gemini) ? { gemini: text(models.gemini) } : {}),
    },
    safeBrowsingEnabled: safeBrowsing.enabled === true,
  };
}

export function mapSafeBrowsingResult(raw: unknown): SafeBrowsingResult {
  const source = record(raw);
  return {
    safe: source.safe === true,
    threats: arr(source.threats).map((entry) => {
      const threat = record(entry);
      return {
        url: text(threat.url),
        threatTypes: arr(threat.threatTypes).filter((value): value is string => typeof value === "string"),
      };
    }).filter((entry) => entry.url),
    checkedUrls: arr(source.checked_urls).filter((value): value is string => typeof value === "string"),
    cached: source.cached === true,
  };
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
