import { api } from "./api";
import type {
  AiFilterMatchDocument,
  AiFilterMatchQuery,
  MastodonFilter,
  MastodonFilterResult,
  MastodonStatus,
} from "./types";
import { SEMANTIC_MODEL_OPENAI } from "./types";

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

  /**
   * OpenAI-backed keywords (keyword.semanticModel === SEMANTIC_MODEL_OPENAI)
   * are matched by FediPod's /api/v1/ailo/ai/filters/match instead of the
   * local model — opt-in per keyword, see fediverse-moderation.tsx. Returns
   * queryId ("filterId:keywordId") → the set of matching status ids.
   */
  private async matchOpenAiKeywords(
    filters: MastodonFilter[],
    documentsByStatus: Map<string, string[]>,
  ): Promise<Map<string, Set<string>>> {
    const queries: AiFilterMatchQuery[] = [];
    for (const filter of filters) {
      for (const keyword of filter.keywords) {
        if (keyword.semantic && keyword.semanticModel === SEMANTIC_MODEL_OPENAI) {
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
      const matches = await api.ai.matchFilters(queries, documents);
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
        "[semantic-filters] OpenAI semantic matching unavailable; those keywords are skipped this pass:",
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
    const semanticFilters = filters.filter((filter) =>
      isActive(filter, context)
      && filter.keywords.some((keyword) => keyword.semantic),
    );
    if (!semanticFilters.length || !statuses.length) return statuses;

    const targets: MastodonStatus[] = [];
    for (const status of statuses) {
      targets.push(status);
      if (status.reblog) targets.push(status.reblog);
    }
    const documentsByStatus = new Map(targets.map((status) => [
      status.id,
      semanticChunks(semanticText(status)).map((chunk) => semanticDocument(chunk, status.title)),
    ]));
    const allDocuments = [...documentsByStatus.values()].flat();
    if (!allDocuments.length) return statuses;

    // Keywords stay on the local, on-device model by default (unset or
    // anything other than SEMANTIC_MODEL_OPENAI) — behavior is unchanged from
    // before this backend existed. Only keywords explicitly opted into
    // SEMANTIC_MODEL_OPENAI go over the network, via matchOpenAiKeywords.
    const localQueries = semanticFilters.flatMap((filter) =>
      filter.keywords
        .filter((keyword) => keyword.semantic && keyword.semanticModel !== SEMANTIC_MODEL_OPENAI)
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

    const openAiMatches = await this.matchOpenAiKeywords(semanticFilters, documentsByStatus);

    for (const status of targets) {
      const documents = documentsByStatus.get(status.id) ?? [];
      for (const filter of semanticFilters) {
        if (exactResult(status, filter.id)) continue;
        const matches = filter.keywords.filter((keyword) => {
          if (!keyword.semantic) return false;
          if (keyword.semanticModel === SEMANTIC_MODEL_OPENAI) {
            return openAiMatches.get(`${filter.id}:${keyword.id}`)?.has(status.id) ?? false;
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
