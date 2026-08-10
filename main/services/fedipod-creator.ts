import type {
  MastodonAccount,
  MastodonCard,
  MastodonCardAuthor,
  MastodonCreatorAttribution,
} from "../types.js";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const string = (value: unknown): string => typeof value === "string" ? value : "";
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function mapCreatorAttribution(
  raw: unknown,
  mapAccount: (raw: unknown) => MastodonAccount,
): MastodonCreatorAttribution {
  const r = record(raw);
  const source = record(r.source);
  const account = mapAccount(r);
  const handle = account.acct || account.username;
  const escaped = handle.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return {
    account,
    domains: array(source.attribution_domains).map(string).filter(Boolean),
    tag: `<meta name="fediverse:creator" content="@${escaped}">`,
  };
}

export function mapCreatorCard(
  raw: unknown,
  mapAccount: (raw: unknown) => MastodonAccount,
): MastodonCard | null {
  const r = record(raw);
  const url = string(r.url);
  if (!url) return null;
  const authors: MastodonCardAuthor[] = array(r.authors).map((value) => {
    const author = record(value);
    return {
      name: string(author.name),
      url: string(author.url),
      account: Object.keys(record(author.account)).length ? mapAccount(author.account) : null,
    };
  });
  return {
    url,
    title: string(r.title),
    description: string(r.description),
    image: string(r.image) || null,
    providerName: string(r.provider_name),
    providerUrl: string(r.provider_url),
    authors,
    missingAttribution: r.missing_attribution === true,
  };
}
