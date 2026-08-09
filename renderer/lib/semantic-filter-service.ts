import type { MastodonFilter, MastodonFilterResult, MastodonStatus } from "./types";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
const DEFAULT_THRESHOLD = 0.55;
const MAX_TEXT_CHARACTERS = 20_000;
const MAX_CHUNKS = 12;
const CACHE_LIMIT = 512;

export type EmbedTexts = (texts: string[]) => Promise<number[][]>;

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
    status.title,
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

function semanticQuery(keyword: string): string {
  return keyword.replace(/^#+/, "").trim();
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
          dtype: "q8",
          revision: MODEL_REVISION,
        });
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
    const chunksByStatus = new Map(targets.map((status) => [status.id, semanticChunks(semanticText(status))]));
    const queries = semanticFilters.flatMap((filter) =>
      filter.keywords.filter((keyword) => keyword.semantic).map((keyword) => semanticQuery(keyword.keyword)),
    );
    const allChunks = [...chunksByStatus.values()].flat();
    if (!allChunks.length) return statuses;

    let vectors: Map<string, number[]>;
    try {
      vectors = await this.vectors([...queries, ...allChunks]);
    } catch (error) {
      console.warn(
        "[semantic-filters] Semantic matching unavailable; exact Mastodon filters remain active:",
        error instanceof Error ? error.message : String(error),
      );
      return statuses;
    }

    for (const status of targets) {
      const chunks = chunksByStatus.get(status.id) ?? [];
      for (const filter of semanticFilters) {
        if (exactResult(status, filter.id)) continue;
        const matches = filter.keywords.filter((keyword) => {
          if (!keyword.semantic) return false;
          const query = vectors.get(semanticQuery(keyword.keyword));
          if (!query) return false;
          const threshold = keyword.semanticThreshold ?? DEFAULT_THRESHOLD;
          return chunks.some((chunk) => dot(query, vectors.get(chunk) ?? []) >= threshold);
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
