import { api } from "./api";
import type {
  AiFilterMatchDocument,
  AiFilterMatchQuery,
  AiProvider,
  MastodonFilter,
  MastodonFilterResult,
  MastodonStatus,
} from "./types";
import { SEMANTIC_MODEL_GEMINI, SEMANTIC_MODEL_OPENAI } from "./types";

const MODEL = "onnx-community/embeddinggemma-300m-ONNX";
const MODEL_REVISION = "5090578d9565bb06545b4552f76e6bc2c93e4a66";
const MODEL_TAG = "embeddinggemma-300m";
const DEFAULT_THRESHOLD = 0.6;
const MAX_TEXT_CHARACTERS = 20_000;
const MAX_CHUNKS = 12;
const CACHE_LIMIT = 512;
const LEGACY_MODEL_PATH = "/Xenova/all-MiniLM-L6-v2/";

export type EmbedTexts = (texts: string[]) => Promise<number[][]>;

async function removeLegacyModelCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  for (const cacheName of await caches.keys()) {
    const cache = await caches.open(cacheName);
    for (const request of await cache.keys()) {
      if (request.url.includes(LEGACY_MODEL_PATH)) await cache.delete(request);
    }
  }
}

function decodeHtml(text: string): string {
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, value: string) => {
      const codePoint = value[0]?.toLowerCase() === "x"
        ? Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 10);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint) : " ";
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity: string) => ({
      amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    })[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function semanticText(status: MastodonStatus): string {
  const source = status.source?.content;
  return decodeHtml([
    status.spoilerText,
    source || status.content,
  ].filter(Boolean).join(". ")).slice(0, MAX_TEXT_CHARACTERS);
}

export function semanticChunks(text: string): string[] {
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/u).filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const parts = sentence.length <= 700
      ? [sentence]
      : sentence.match(/[\s\S]{1,700}(?:\s|$)/g) ?? [sentence.slice(0, 700)];
    for (const part of parts) {
      if (part.trim()) chunks.push(part.trim());
      if (chunks.length >= MAX_CHUNKS) return chunks;
    }
  }
  return chunks;
}

export function semanticQuery(keyword: string): string {
  const content = keyword.replace(/^#+/, "").trim();
  return `task: search result | query: ${content}`;
}

export function semanticDocument(text: string, title: string | null): string {
  const normalizedTitle = title ? decodeHtml(title).slice(0, 300) : "none";
  return `title: ${normalizedTitle || "none"} | text: ${text}`;
}

function semanticThreshold(keyword: MastodonFilter["keywords"][number]): number {
  if (keyword.semanticModel === MODEL_TAG) return keyword.semanticThreshold ?? DEFAULT_THRESHOLD;
  const legacy = keyword.semanticThreshold ?? 0.55;
  if (legacy <= 0.45) return 0.54;
  if (legacy <= 0.55) return 0.6;
  return 0.67;
}

function dot(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) score += left[index] * right[index];
  return score;
}

// Guaranteed baseline every keyword gets, semantic or not — apply() used to
// only ever check embedding similarity, which is a real signal (see
// matchRemoteKeywords/the local path below) but not a GUARANTEE: a single
// short keyword like "nsfw" scores well under even this app's most
// permissive preset against realistic post text that spells it out
// literally, verified against the real embedding endpoint. A keyword
// created with semantic:false (the AI moderation "accept" flow makes
// these) had no other path to ever match anything at all — apply() skipped
// non-semantic keywords outright. This is what actually makes "the exact
// text, hashtag, whole word, or phrase" (the filters UI's own description)
// true, unconditionally, independent of any threshold. A leading '#' is
// stripped from both the keyword and the post text, mirroring
// semanticQuery()'s own stripping on the query side, so a filter written
// as "#nsfw" and one written as "nsfw" match the same hashtag AND
// plain-text mentions either way.
function stripHashes(text: string): string {
  return text.replace(/#(?=[\p{L}\p{N}_])/gu, "");
}

function literalMatch(text: string, keyword: MastodonFilter["keywords"][number]): boolean {
  const needle = keyword.keyword.replace(/^#+/, "").trim().toLocaleLowerCase();
  if (!needle) return false;
  const haystack = stripHashes(text).toLocaleLowerCase();
  if (!keyword.wholeWord) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`, "u").test(` ${haystack} `);
}

function isActive(filter: MastodonFilter, context: string, now = Date.now()): boolean {
  return filter.context.includes(context)
    && (!filter.expiresAt || Date.parse(filter.expiresAt) > now);
}

function exactResult(status: MastodonStatus, filterId: string): MastodonFilterResult | undefined {
  return status.filtered.find((result) => result.filter.id === filterId);
}

export class SemanticFilterService {
  private readonly cache = new Map<string, number[]>();
  private embedder: EmbedTexts | null;
  private embedderPromise: Promise<EmbedTexts> | null = null;
  private failures = 0;
  private retryAfter = 0;

  constructor(embedder: EmbedTexts | null = null) {
    this.embedder = embedder;
  }

  private async loadEmbedder(): Promise<EmbedTexts> {
    if (this.embedder) return this.embedder;
    if (Date.now() < this.retryAfter) throw new Error("Semantic model is temporarily unavailable");
    if (!this.embedderPromise) {
      this.embedderPromise = (async () => {
        const { pipeline } = await import("@huggingface/transformers");
        const extractor = await pipeline("feature-extraction", MODEL, {
          dtype: "q4",
          revision: MODEL_REVISION,
        });
        await removeLegacyModelCache().catch(() => undefined);
        return async (texts: string[]) => {
          const output = await extractor(texts, { pooling: "mean", normalize: true });
          const width = output.dims[output.dims.length - 1] ?? 0;
          if (!width || output.data.length !== texts.length * width) {
            throw new Error("Semantic model returned an invalid embedding shape");
          }
          const values = Array.from(output.data as Float32Array);
          return texts.map((_text, index) => values.slice(index * width, (index + 1) * width));
        };
      })();
    }
    try {
      this.embedder = await this.embedderPromise;
      this.failures = 0;
      this.retryAfter = 0;
      return this.embedder;
    } catch (error) {
      this.embedderPromise = null;
      this.failures += 1;
      const delay = Math.min(30 * 60_000, 30_000 * (2 ** (this.failures - 1)));
      this.retryAfter = Date.now() + delay;
      throw error;
    }
  }

  async ensureAvailable(): Promise<void> {
    await this.loadEmbedder();
  }

  async matchPhrases(
    statuses: MastodonStatus[],
    phrases: string[],
    threshold = DEFAULT_THRESHOLD,
  ): Promise<Set<string>> {
    const queries = [...new Set(phrases.map((phrase) => semanticQuery(phrase)).filter(Boolean))];
    if (!statuses.length || !queries.length) return new Set();
    const documents = new Map(statuses.map((status) => [
      status.id,
      semanticChunks(semanticText(status)).map((chunk) => semanticDocument(chunk, status.title)),
    ]));
    const vectors = await this.vectors([...queries, ...[...documents.values()].flat()]);
    const matches = new Set<string>();
    for (const [id, statusDocuments] of documents) {
      if (queries.some((query) => statusDocuments.some((document) =>
        dot(vectors.get(query) ?? [], vectors.get(document) ?? []) >= threshold))) matches.add(id);
    }
    return matches;
  }

  private async vectors(texts: string[]): Promise<Map<string, number[]>> {
    const unique = [...new Set(texts.filter(Boolean))];
    const missing = unique.filter((text) => !this.cache.has(text));
    if (missing.length) {
      const embed = await this.loadEmbedder();
      const vectors = await embed(missing);
      if (vectors.length !== missing.length || vectors.some((vector) => !vector.length)) {
        throw new Error("Semantic model returned incomplete embeddings");
      }
      missing.forEach((text, index) => {
        this.cache.delete(text);
        this.cache.set(text, vectors[index]);
      });
      while (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value as string | undefined;
        if (!oldest) break;
        this.cache.delete(oldest);
      }
    }
    return new Map(unique.map((text) => [text, this.cache.get(text)!]));
  }

  /** Remote-provider keywords are matched by FediPod instead of the local model. */
  private async matchRemoteKeywords(
    filters: MastodonFilter[],
    documentsByStatus: Map<string, string[]>,
    semanticModel: string,
    provider: AiProvider,
  ): Promise<Map<string, Set<string>>> {
    const queries: AiFilterMatchQuery[] = [];
    for (const filter of filters) {
      for (const keyword of filter.keywords) {
        if (keyword.semantic && keyword.semanticModel === semanticModel) {
          queries.push({
            id: `${filter.id}:${keyword.id}`,
            text: semanticQuery(keyword.keyword),
            threshold: keyword.semanticThreshold ?? undefined,
          });
        }
      }
    }
    if (!queries.length) return new Map();

    const documents: AiFilterMatchDocument[] = [];
    const statusIdByDocumentId = new Map<string, string>();
    for (const [statusId, texts] of documentsByStatus) {
      texts.forEach((text, index) => {
        const id = `${statusId}::${index}`;
        documents.push({ id, text });
        statusIdByDocumentId.set(id, statusId);
      });
    }
    if (!documents.length) return new Map();

    try {
      const matches = await api.ai.matchFilters(queries, documents, provider);
      const byQuery = new Map<string, Set<string>>();
      for (const match of matches) {
        const statusId = statusIdByDocumentId.get(match.documentId);
        if (!statusId) continue;
        if (!byQuery.has(match.queryId)) byQuery.set(match.queryId, new Set());
        byQuery.get(match.queryId)?.add(statusId);
      }
      return byQuery;
    } catch (error) {
      console.warn(
        `[semantic-filters] ${provider} semantic matching unavailable; those keywords are skipped this pass:`,
        error instanceof Error ? error.message : String(error),
      );
      return new Map();
    }
  }

  async apply(
    statuses: MastodonStatus[],
    filters: MastodonFilter[],
    context: "home" | "notifications",
  ): Promise<MastodonStatus[]> {
    const activeFilters = filters.filter((filter) => isActive(filter, context));
    if (!activeFilters.length || !statuses.length) return statuses;

    const targets: MastodonStatus[] = [];
    for (const status of statuses) {
      targets.push(status);
      if (status.reblog) targets.push(status.reblog);
    }

    // Literal match, every active filter, unconditionally — see
    // literalMatch()'s own comment for why this can't be semantic-only.
    for (const status of targets) {
      const text = semanticText(status);
      for (const filter of activeFilters) {
        const matches = filter.keywords.filter((keyword) => literalMatch(text, keyword));
        if (matches.length) {
          status.filtered.push({ filter, keywordMatches: matches.map((keyword) => keyword.id) });
        }
      }
    }

    const semanticFilters = activeFilters.filter((filter) => filter.keywords.some((keyword) => keyword.semantic));
    if (!semanticFilters.length) return statuses;

    const documentsByStatus = new Map(targets.map((status) => [
      status.id,
      semanticChunks(semanticText(status)).map((chunk) => semanticDocument(chunk, status.title)),
    ]));
    const allDocuments = [...documentsByStatus.values()].flat();
    if (!allDocuments.length) return statuses;

    // Keywords stay local by default. Only explicitly selected provider
    // models go over the network.
    const localQueries = semanticFilters.flatMap((filter) =>
      filter.keywords
        .filter((keyword) => keyword.semantic
          && keyword.semanticModel !== SEMANTIC_MODEL_OPENAI
          && keyword.semanticModel !== SEMANTIC_MODEL_GEMINI)
        .map((keyword) => semanticQuery(keyword.keyword)),
    );

    let localVectors: Map<string, number[]> = new Map();
    if (localQueries.length) {
      try {
        localVectors = await this.vectors([...localQueries, ...allDocuments]);
      } catch (error) {
        console.warn(
          "[semantic-filters] Local semantic matching unavailable; exact Mastodon filters remain active:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const openAiMatches = await this.matchRemoteKeywords(
      semanticFilters, documentsByStatus, SEMANTIC_MODEL_OPENAI, "openai");
    const geminiMatches = await this.matchRemoteKeywords(
      semanticFilters, documentsByStatus, SEMANTIC_MODEL_GEMINI, "gemini");

    for (const status of targets) {
      const documents = documentsByStatus.get(status.id) ?? [];
      for (const filter of semanticFilters) {
        if (exactResult(status, filter.id)) continue;
        const matches = filter.keywords.filter((keyword) => {
          if (!keyword.semantic) return false;
          if (keyword.semanticModel === SEMANTIC_MODEL_OPENAI) {
            return openAiMatches.get(`${filter.id}:${keyword.id}`)?.has(status.id) ?? false;
          }
          if (keyword.semanticModel === SEMANTIC_MODEL_GEMINI) {
            return geminiMatches.get(`${filter.id}:${keyword.id}`)?.has(status.id) ?? false;
          }
          if (!localVectors.size) return false;
          const query = localVectors.get(semanticQuery(keyword.keyword));
          if (!query) return false;
          const threshold = semanticThreshold(keyword);
          return documents.some((document) => dot(query, localVectors.get(document) ?? []) >= threshold);
        });
        if (matches.length) {
          status.filtered.push({
            filter,
            keywordMatches: matches.map((keyword) => keyword.id),
          });
        }
      }
    }
    return statuses;
  }
}

export const semanticFilterService = new SemanticFilterService();
