/** Helpers for addressing ActivityPub Group actors through FediPod's Mastodon API. */

export function normalizeCommunityHandle(input: string): string {
  const handle = input.trim().replace(/^[!@]/, "");
  const parts = handle.split("@");

  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    /\s|[/?#]/.test(handle) ||
    parts[1].startsWith(".") ||
    parts[1].endsWith(".")
  ) {
    throw new Error("Enter a full community handle, for example !technology@lemmy.world.");
  }

  return `${parts[0]}@${parts[1].toLowerCase()}`;
}

export function requireExactGroup<T extends { acct: string; group: boolean }>(
  accounts: T[],
  handleInput: string,
): T {
  const handle = normalizeCommunityHandle(handleInput);
  const exact = accounts.find(
    (account) => account.acct.toLowerCase().replace(/^@/, "") === handle.toLowerCase(),
  );

  if (!exact) {
    throw new Error(`Could not find !${handle}. Check the full community handle and federation.`);
  }
  if (!exact.group) {
    throw new Error(`@${exact.acct} is a person or service, not an ActivityPub community.`);
  }
  return exact;
}
