import type {
  MastodonCollection,
  MastodonCollectionImportResult,
  MastodonCollectionSource,
  MastodonCollectionSourcePreview,
  MastodonStatus,
} from "../types.js";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
const string = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function mapQuoteMetadata(
  raw: unknown,
  mapNested: (raw: unknown) => MastodonStatus | null,
): Pick<MastodonStatus, "quote" | "quoteApproval" | "quotesCount"> {
  const r = record(raw);
  const quote = record(r.quote);
  const approval = record(r.quote_approval);
  return {
    quote: Object.keys(quote).length ? {
      state: string(quote.state, "pending"),
      quotedStatus: mapNested(quote.quoted_status),
    } : null,
    quoteApproval: Object.keys(approval).length ? {
      automatic: array(approval.automatic).map((value) => string(value)).filter(Boolean),
      manual: array(approval.manual).map((value) => string(value)).filter(Boolean),
      currentUser: typeof approval.current_user === "string" ? approval.current_user : null,
    } : null,
    quotesCount: typeof r.quotes_count === "number" && Number.isFinite(r.quotes_count)
      ? r.quotes_count : 0,
  };
}

export function mapCollection(raw: unknown): MastodonCollection {
  const outer = record(raw);
  const r = Object.keys(record(outer.collection)).length ? record(outer.collection) : outer;
  return {
    id: string(r.id), accountId: string(r.account_id), uri: string(r.uri), url: string(r.url),
    name: string(r.name), description: string(r.description),
    language: typeof r.language === "string" ? r.language : null,
    sensitive: r.sensitive === true, discoverable: r.discoverable === true,
    itemCount: typeof r.item_count === "number" && Number.isFinite(r.item_count) ? r.item_count : 0,
    items: array(r.items).map((value) => {
      const item = record(value);
      const state = string(item.state, "pending");
      return {
        id: string(item.id), accountId: string(item.account_id),
        state: (["accepted", "rejected", "revoked"] as string[]).includes(state)
          ? state as "accepted" | "rejected" | "revoked" : "pending",
        createdAt: string(item.created_at),
      };
    }),
    createdAt: string(r.created_at), updatedAt: string(r.updated_at),
    sourceUrl: typeof r.source_url === "string" ? r.source_url : null,
    sourcePage: typeof r.source_page === "string" ? r.source_page : null,
    sourceKind: typeof r.source_kind === "string" ? r.source_kind : null,
  };
}

export function mapCollectionSource(raw: unknown): MastodonCollectionSource {
  const r = record(raw);
  return {
    id: string(r.id), name: string(r.name), url: string(r.url),
    description: string(r.description), importHint: string(r.importHint),
  };
}

export function mapCollectionSourcePreview(raw: unknown): MastodonCollectionSourcePreview {
  const r = record(raw);
  return {
    name: string(r.name), description: string(r.description),
    sourceUrl: string(r.source_url), sourcePage: string(r.source_page),
    sourceKind: string(r.source_kind),
    accountCount: typeof r.account_count === "number" ? r.account_count : 0,
  };
}

export function mapCollectionImport(raw: unknown): MastodonCollectionImportResult {
  const r = record(raw);
  return {
    collections: array(r.collections).map(mapCollection), sourceUrl: string(r.source_url),
    accountCount: typeof r.account_count === "number" ? r.account_count : 0,
    failedCount: typeof r.failed_count === "number" ? r.failed_count : 0,
    invitationCount: typeof r.invitation_count === "number" ? r.invitation_count : 0,
    addedCount: typeof r.added_count === "number" ? r.added_count : 0,
    removedCount: typeof r.removed_count === "number" ? r.removed_count : 0,
    alreadyImported: r.already_imported === true,
  };
}
