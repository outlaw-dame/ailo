import type { CustomFeed, MastodonStatus } from "./types";
import { semanticText } from "./semantic-filter-service";

function plainText(status: MastodonStatus): string {
  return semanticText(status).toLocaleLowerCase();
}

function account(status: MastodonStatus): string {
  return (status.account.acct || status.account.username).replace(/^@/, "").toLocaleLowerCase();
}

// Hashtags/words/phrases were already lowercased at comparison time —
// accounts and excludeAccounts weren't, so a feed rule typed with any
// capitalization (e.g. "Alice@Example.Social", how a handle is often
// written) silently never matched a post's actual (lowercase) acct.
function lowercased(values: string[]): string[] {
  return values.map((value) => value.toLocaleLowerCase());
}

export function exactCustomFeedMatch(status: MastodonStatus, feed: CustomFeed): boolean {
  const text = plainText(status);
  const author = account(status);
  if (lowercased(feed.excludeAccounts).includes(author)) return false;
  if (feed.excludeWords.some((word) => text.includes(word.toLocaleLowerCase()))) return false;
  if (lowercased(feed.accounts).includes(author)) return true;
  if (feed.hashtags.some((tag) => new RegExp(`(^|[^\\p{L}\\p{N}_])#${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu").test(text))) return true;
  return feed.semanticKeywords.some((phrase) => text.includes(phrase.toLocaleLowerCase()));
}

export function filterCustomFeed(
  statuses: MastodonStatus[],
  feed: CustomFeed,
  semanticMatches: ReadonlySet<string>,
): MastodonStatus[] {
  const excludeAccounts = lowercased(feed.excludeAccounts);
  return statuses.filter((status) => {
    const text = plainText(status);
    const author = account(status);
    if (excludeAccounts.includes(author)) return false;
    if (feed.excludeWords.some((word) => text.includes(word.toLocaleLowerCase()))) return false;
    return exactCustomFeedMatch(status, feed) || semanticMatches.has(status.id);
  });
}
