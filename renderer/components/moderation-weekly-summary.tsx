import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookText, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import type { AiAccountSuggestion, AiDomainSuggestion, AiKeywordSuggestion } from "../lib/types";
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

// "▲ 4 vs last week" / "▼ 2 vs last week" / "same as last week" — `previous`
// is the single 7-day window immediately before `current`'s, not a delta.
function trendLabel(t: (key: string, options?: Record<string, unknown>) => string, current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return t("moderation.trendSame");
  return t(diff > 0 ? "moderation.trendUp" : "moderation.trendDown", { diff: Math.abs(diff) });
}

function BreakdownList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  if (!rows.length) return null;
  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1">
      <Text variant="mini" color="tertiary">{title}</Text>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-2">
          <Text variant="small" truncate>{row.label}</Text>
          <Text variant="small" color="tertiary">{row.count}</Text>
        </div>
      ))}
    </div>
  );
}

/** Weekly recap at the top of the Safety page: an AI-written paragraph (when
 * a provider is configured), the week's headline numbers, and AI moderation
 * suggestions — merged here rather than left as their own section, since
 * "here's what happened, here's what to do about it" reads as one thing. */
export function ModerationWeeklySummary() {
  const { t } = useTranslation();
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
      toast.success(t("moderation.filterAdded", { keyword: suggestion.keyword }));
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
      toast.success(t("moderation.accountBlocked", { handle: suggestion.acct }));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const acceptDomainSuggestion = useMutation({
    mutationFn: (suggestion: AiDomainSuggestion) => api.fedipod.setDomainBlock(suggestion.domain, true),
    onSuccess: async (_result, suggestion) => {
      setDismissed((prev) => new Set(prev).add(`domain:${suggestion.domain}`));
      await refresh();
      toast.success(t("moderation.domainBlocked", { domain: suggestion.domain }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const s = stats.data;
  const contentBlocked = s ? s.filteredPosts + s.intakeBlockedPosts : null;

  return (
    <section className="flex flex-col gap-3 rounded-control border border-secondary p-4">
      <div className="flex flex-wrap items-center gap-2">
        <NotebookText className="size-4" /><Text variant="strong">{t("moderation.summaryTitle")}</Text>
        {aiEnabled ? <AiProviderControl status={aiStatus.data} provider={aiProvider} onChange={setAiProvider} /> : null}
      </div>

      {aiEnabled ? (
        summary.isPending ? <Text variant="small" color="tertiary">{t("moderation.summaryWriting")}</Text>
        : summary.isError ? null
        : summary.data ? <Text variant="small">{summary.data}</Text>
        : null
      ) : (
        <Text variant="small" color="tertiary">
          {t("moderation.summaryNoProvider")}
        </Text>
      )}

      <div className="flex flex-wrap gap-2">
        <StatTile label={t("moderation.blockedAccountsLabel")} value={s?.blockedAccounts ?? "—"}
          detail={s ? t("moderation.thisWeek", { count: s.newBlockedAccounts }) : undefined} />
        <StatTile label={t("moderation.mutedAccountsLabel")} value={s?.mutedAccounts ?? "—"}
          detail={s ? t("moderation.thisWeek", { count: s.newMutedAccounts }) : undefined} />
        <StatTile label={t("moderation.blockedDomainsLabel")} value={s?.blockedDomains ?? "—"}
          detail={s ? t("moderation.thisWeek", { count: s.newBlockedDomains }) : undefined} />
        <StatTile label={t("moderation.activeFiltersLabel")} value={s?.activeFilters ?? "—"}
          detail={s ? t("moderation.keywordCount", { count: s.activeKeywords }) : undefined} />
        <StatTile label={t("moderation.contentBlockedLabel")} value={contentBlocked ?? "—"}
          detail={s ? t("moderation.contentBlockedDetail", {
            filtered: s.filteredPosts,
            intake: s.intakeBlockedPosts,
            trend: trendLabel(t, contentBlocked!, s.previousWeekContentBlocked),
          }) : undefined} />
      </div>
      {stats.isError ? <Text variant="mini" color="danger">{t("moderation.statsError")}</Text> : null}

      {s && (s.topDomains.length || s.topFilters.length) ? (
        <div className="flex flex-wrap gap-4">
          <BreakdownList title={t("moderation.topDomainsTitle")}
            rows={s.topDomains.map((d) => ({ label: d.domain, count: d.count }))} />
          <BreakdownList title={t("moderation.byFilterTitle")}
            rows={s.topFilters.map((f) => ({ label: f.title, count: f.count }))} />
        </div>
      ) : null}

      {aiEnabled ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><Sparkles className="size-4" /><Text variant="small-strong">{t("moderation.suggestionsTitle")}</Text></div>
          {suggestions.data?.keywords
            .filter((item) => !dismissed.has(`keyword:${item.keyword}`))
            .map((item) => (
              <div key={`keyword:${item.keyword}`} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Text variant="small">{t("moderation.filterKeyword", { keyword: item.keyword })}</Text>
                  <Text variant="mini" color="tertiary" truncate>{item.reason}</Text>
                </div>
                <Button size="small" variant="filled" disabled={acceptKeywordSuggestion.isPending}
                  onClick={() => acceptKeywordSuggestion.mutate(item)}>{t("common.accept")}</Button>
                <Button size="small" variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`keyword:${item.keyword}`))}>{t("common.dismiss")}</Button>
              </div>
            ))}
          {suggestions.data?.accounts
            .filter((item) => !dismissed.has(`account:${item.acct}`))
            .map((item) => (
              <div key={`account:${item.acct}`} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Text variant="small">{t("moderation.blockAccount", { handle: item.acct })}</Text>
                  <Text variant="mini" color="tertiary" truncate>{item.reason}</Text>
                </div>
                <Button size="small" variant="filled" disabled={acceptAccountSuggestion.isPending}
                  onClick={() => acceptAccountSuggestion.mutate(item)}>{t("common.accept")}</Button>
                <Button size="small" variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`account:${item.acct}`))}>{t("common.dismiss")}</Button>
              </div>
            ))}
          {suggestions.data?.domains
            .filter((item) => !dismissed.has(`domain:${item.domain}`))
            .map((item) => (
              <div key={`domain:${item.domain}`} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Text variant="small">{t("moderation.blockDomain", { domain: item.domain })}</Text>
                  <Text variant="mini" color="tertiary" truncate>{item.reason}</Text>
                </div>
                <Button size="small" variant="filled" disabled={acceptDomainSuggestion.isPending}
                  onClick={() => acceptDomainSuggestion.mutate(item)}>{t("common.accept")}</Button>
                <Button size="small" variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`domain:${item.domain}`))}>{t("common.dismiss")}</Button>
              </div>
            ))}
          {suggestions.data
            && !suggestions.data.keywords.length && !suggestions.data.accounts.length && !suggestions.data.domains.length ? (
            <Text variant="small" color="tertiary">{t("moderation.noSuggestions")}</Text>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

