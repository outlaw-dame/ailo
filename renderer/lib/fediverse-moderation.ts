import type { MastodonFilterResult } from "./types";

export function moderationFor(results: MastodonFilterResult[]): {
  hidden: boolean;
  warnings: MastodonFilterResult[];
} {
  return {
    hidden: results.some((result) => result.filter.action === "hide"),
    warnings: results.filter((result) => result.filter.action !== "hide"),
  };
}
