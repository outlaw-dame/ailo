import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookText, Sparkles } from "lucide-react";
import { Button, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import type { AiAccountSuggestion, AiKeywordSuggestion } from "../lib/types";
import { AiProviderControl, useAiProvider } from "./ai-provider-control";

function StatTile({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="flex min-w-32 flex-1 flex-col gap-0.5 rounded-control border border-secondary px-3 py-2.5">
      <Text variant="mini" color="tertiary">{label}</Text>
      <Text variant="heading3">{value}</Text>
      {detail ? <Text variant="mini" color="tertiary">{detail}</Text> : null}
    </div>
  );
}

/** Weekly recap at the top of the Safety page: an AI-written paragraph (when
 * a provider is configured), the week's headline numbers, and AI moderation
 * suggestions — merged here rather than left as their own section, since
 * "here's what happened, here's what to do about it" reads as one thing. */
export function ModerationWeeklySummary() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  const stats = useQuery({ queryKey: ["fedipod", "moderation-stats"], queryFn: api.fedipod.moderationStats });
  const aiStatus = useQuery({ queryKey: ["fedipod", "ai", "status"], queryFn: api.ai.status });
  const aiEnabled = aiStatus.data?.enabled ?? false;
  const [aiProvider, setAiProvider] = useAiProvider(aiStatus.data);

  const summary = useQuery({
    queryKey: ["fedipod", "ai", "moderation-summary", aiProvider],
    queryFn: () => api.ai.summarizeModeration(aiProvider ?? undefined),
    enabled: aiEnabled && Boolean(aiProvider) && stats.isSuccess,
  });
  const suggestions = useQuery({
    queryKey: ["fedipod", "ai", "moderation-suggestions", aiProvider],
    queryFn: () => api.ai.suggestModeration(aiProvider ?? undefined),
    enabled: aiEnabled && Boolean(aiProvider),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fedipod", "blocks"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "mutes"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "domain-blocks"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "filters"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "moderation-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "timeline"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "notifications"] }),
    ]);
  };

  // AI moderation suggestions are generated fresh each call, not persisted —
  // "accept" reuses the exact same filter/block mutations the manual forms
  // elsewhere on this page use; "dismiss" just hides it from this render.
  const acceptKeywordSuggestion = useMutation({
    mutationFn: (suggestion: AiKeywordSuggestion) =>
      api.fedipod.createFilter({
        title: suggestion.keyword,
        action: "warn",
        keywords: [{ keyword: suggestion.keyword, semantic: false }],
      }),
    onSuccess: async (_result, suggestion) => {
      setDismissed((prev) => new Set(prev).add(`keyword:${suggestion.keyword}`));
      await refresh();
      toast.success(`Added "${suggestion.keyword}" as a filter`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const acceptAccountSuggestion = useMutation({
    mutationFn: async (suggestion: AiAccountSuggestion) => {
      const account = await api.fedipod.resolveCommunity(suggestion.acct);
      return api.fedipod.block(account.id, true);
    },
    onSuccess: async (_result, suggestion) => {
      setDismissed((prev) => new Set(prev).add(`account:${suggestion.acct}`));
      await refresh();
      toast.success(`Blocked @${suggestion.acct}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const s = stats.data;
  const contentBlocked = s ? s.filteredPosts + s.intakeBlockedPosts : null;

  return (
    <section className="flex flex-col gap-3 rounded-control border border-secondary p-4">
      <div className="flex flex-wrap items-center gap-2">
        <NotebookText className="size-4" /><Text variant="strong">Weekly moderation summary</Text>
        {aiEnabled ? <AiProviderControl status={aiStatus.data} provider={aiProvider} onChange={setAiProvider} /> : null}
      </div>

      {aiEnabled ? (
        summary.isPending ? <Text variant="small" color="tertiary">Writing this week's recap…</Text>
        : summary.isError ? null
        : summary.data ? <Text variant="small">{summary.data}</Text>
        : null
      ) : (
        <Text variant="small" color="tertiary">
          Connect an OpenAI or Gemini key on Provider Keys to get a written recap here each week.
        </Text>
      )}

      <div className="flex flex-wrap gap-2">
        <StatTile label="Blocked accounts" value={s?.blockedAccounts ?? "—"}
          detail={s ? `+${s.newBlockedAccounts} this week` : undefined} />
        <StatTile label="Muted accounts" value={s?.mutedAccounts ?? "—"}
          detail={s ? `+${s.newMutedAccounts} this week` : undefined} />
        <StatTile label="Blocked domains" value={s?.blockedDomains ?? "—"}
          detail={s ? `+${s.newBlockedDomains} this week` : undefined} />
        <StatTile label="Active filters" value={s?.activeFilters ?? "—"}
          detail={s ? `${s.activeKeywords} keyword${s.activeKeywords === 1 ? "" : "s"}/phrase${s.activeKeywords === 1 ? "" : "s"}` : undefined} />
        <StatTile label="Content blocked this week" value={contentBlocked ?? "—"}
          detail={s ? `${s.filteredPosts} hidden by filters, ${s.intakeBlockedPosts} kept from reaching you` : undefined} />
      </div>
      {stats.isError ? <Text variant="mini" color="danger">Could not load this week's moderation stats.</Text> : null}

      {aiEnabled ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><Sparkles className="size-4" /><Text variant="small-strong">Suggestions</Text></div>
          {suggestions.data?.keywords
            .filter((item) => !dismissed.has(`keyword:${item.keyword}`))
            .map((item) => (
              <div key={`keyword:${item.keyword}`} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Text variant="small">Filter keyword: {item.keyword}</Text>
                  <Text variant="mini" color="tertiary" truncate>{item.reason}</Text>
                </div>
                <Button size="small" variant="filled" disabled={acceptKeywordSuggestion.isPending}
                  onClick={() => acceptKeywordSuggestion.mutate(item)}>Accept</Button>
                <Button size="small" variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`keyword:${item.keyword}`))}>Dismiss</Button>
              </div>
            ))}
          {suggestions.data?.accounts
            .filter((item) => !dismissed.has(`account:${item.acct}`))
            .map((item) => (
              <div key={`account:${item.acct}`} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Text variant="small">Block @{item.acct}</Text>
                  <Text variant="mini" color="tertiary" truncate>{item.reason}</Text>
                </div>
                <Button size="small" variant="filled" disabled={acceptAccountSuggestion.isPending}
                  onClick={() => acceptAccountSuggestion.mutate(item)}>Accept</Button>
                <Button size="small" variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`account:${item.acct}`))}>Dismiss</Button>
              </div>
            ))}
          {suggestions.data?.domains
            .filter((item) => !dismissed.has(`domain:${item.domain}`))
            .map((item) => (
              <div key={`domain:${item.domain}`} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Text variant="small">{item.domain}</Text>
                  <Text variant="mini" color="tertiary" truncate>
                    {item.reason} — domain blocking isn&apos;t available from this panel yet.
                  </Text>
                </div>
                <Button size="small" variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`domain:${item.domain}`))}>Dismiss</Button>
              </div>
            ))}
          {suggestions.data
            && !suggestions.data.keywords.length && !suggestions.data.accounts.length && !suggestions.data.domains.length ? (
            <Text variant="small" color="tertiary">Nothing to suggest right now.</Text>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

