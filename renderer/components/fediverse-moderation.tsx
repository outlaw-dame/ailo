import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListFilter, Sparkles, ShieldBan, Trash2, VolumeX } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Label,
  SegmentedControl,
  SegmentedControlItem,
  Switch,
  Text,
  toast,
} from "@glaze/core/components";

import { api } from "../lib/api";
import { semanticFilterService } from "../lib/semantic-filter-service";
import { SEMANTIC_MODEL_LOCAL, SEMANTIC_MODEL_OPENAI } from "../lib/types";
import type { AiAccountSuggestion, AiKeywordSuggestion, MastodonAccount } from "../lib/types";

function AccountRow({
  account,
  action,
  pending,
}: {
  account: MastodonAccount;
  action: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
      <img src={account.avatar} alt="" className="size-8 rounded-full bg-control-subtle object-cover" />
      <div className="min-w-0 flex-1">
        <Text variant="small" truncate>{account.displayName}</Text>
        <Text variant="mini" color="tertiary" truncate>@{account.acct || account.username}</Text>
      </div>
      <Button size="small" variant="filled" disabled={pending} onClick={action}>Remove</Button>
    </div>
  );
}

export function FediverseModeration() {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [wholeWord, setWholeWord] = React.useState(false);
  const [action, setAction] = React.useState<"warn" | "hide">("warn");
  const [semanticThreshold, setSemanticThreshold] = React.useState("0.60");
  const [semanticBackend, setSemanticBackend] = React.useState(SEMANTIC_MODEL_LOCAL);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  const blocks = useQuery({ queryKey: ["fedipod", "blocks"], queryFn: api.fedipod.blocks });
  const mutes = useQuery({ queryKey: ["fedipod", "mutes"], queryFn: api.fedipod.mutes });
  const filters = useQuery({ queryKey: ["fedipod", "filters"], queryFn: api.fedipod.filters });
  const aiStatus = useQuery({ queryKey: ["fedipod", "ai", "status"], queryFn: api.ai.status });
  const aiEnabled = aiStatus.data?.enabled ?? false;
  const suggestions = useQuery({
    queryKey: ["fedipod", "ai", "moderation-suggestions"],
    queryFn: api.ai.suggestModeration,
    enabled: aiEnabled,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fedipod", "blocks"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "mutes"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "filters"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "timeline"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "notifications"] }),
    ]);
  };

  const unblock = useMutation({
    mutationFn: (id: string) => api.fedipod.block(id, false),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const unmute = useMutation({
    mutationFn: (id: string) => api.fedipod.mute(id, false),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const createFilter = useMutation({
    mutationFn: async () => {
      // Only the local model needs its ~230 MB weights downloaded/cached;
      // OpenAI-backed keywords are matched server-side, nothing to load here.
      if (semanticBackend === SEMANTIC_MODEL_LOCAL) await semanticFilterService.ensureAvailable();
      return api.fedipod.createFilter({
        title,
        keyword,
        wholeWord,
        action,
        semantic: true,
        semanticThreshold: Number(semanticThreshold),
        semanticModel: semanticBackend,
      });
    },
    onSuccess: async () => {
      setTitle("");
      setKeyword("");
      setWholeWord(false);
      await refresh();
      toast.success("Semantic filter created");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeFilter = useMutation({
    mutationFn: api.fedipod.deleteFilter,
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  // AI moderation suggestions are generated fresh each call, not persisted —
  // "accept" reuses the exact same filter/block mutations as the manual
  // forms above; "dismiss" just hides it from this render.
  const acceptKeywordSuggestion = useMutation({
    mutationFn: (suggestion: AiKeywordSuggestion) =>
      api.fedipod.createFilter({
        title: suggestion.keyword,
        keyword: suggestion.keyword,
        action: "warn",
        semantic: false,
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

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><ShieldBan className="size-4" /><Text variant="strong">Blocked accounts</Text></div>
        {blocks.data?.length ? blocks.data.map((account) => (
          <AccountRow key={account.id} account={account} pending={unblock.isPending} action={() => unblock.mutate(account.id)} />
        )) : <Text variant="small" color="tertiary">No blocked accounts.</Text>}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><VolumeX className="size-4" /><Text variant="strong">Muted accounts</Text></div>
        {mutes.data?.length ? mutes.data.map((account) => (
          <AccountRow key={account.id} account={account} pending={unmute.isPending} action={() => unmute.mutate(account.id)} />
        )) : <Text variant="small" color="tertiary">No muted accounts.</Text>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2"><ListFilter className="size-4" /><Text variant="strong">Semantic filters</Text></div>
        <Text variant="small" color="tertiary">
          Match the exact text, hashtag, whole word, or phrase—and posts with the same meaning.
          EmbeddingGemma analysis runs locally. Its approximately 230 MB model downloads and
          caches when you add your first filter.
        </Text>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Filter name" aria-label="Filter name" maxLength={200} />
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Keyword or phrase" aria-label="Filter keyword" maxLength={500} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl size="small" value={action} onValueChange={(value) => setAction(value as "warn" | "hide")} aria-label="Filter action">
            <SegmentedControlItem value="warn">Warn</SegmentedControlItem>
            <SegmentedControlItem value="hide">Hide</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedControl size="small" value={semanticThreshold} onValueChange={setSemanticThreshold} aria-label="Semantic sensitivity">
            <SegmentedControlItem value="0.67">Strict</SegmentedControlItem>
            <SegmentedControlItem value="0.60">Balanced</SegmentedControlItem>
            <SegmentedControlItem value="0.54">Broad</SegmentedControlItem>
          </SegmentedControl>
          {aiEnabled ? (
            <SegmentedControl
              size="small"
              value={semanticBackend}
              onValueChange={setSemanticBackend}
              aria-label="Semantic matching backend"
            >
              <SegmentedControlItem value={SEMANTIC_MODEL_LOCAL}>Local</SegmentedControlItem>
              <SegmentedControlItem value={SEMANTIC_MODEL_OPENAI}>OpenAI</SegmentedControlItem>
            </SegmentedControl>
          ) : null}
          <Label className="gap-2"><Switch checked={wholeWord} onCheckedChange={setWholeWord} />Whole-word exact match</Label>
          <Button className="ml-auto" size="small" variant="accent" disabled={createFilter.isPending || !title.trim() || !keyword.trim()} onClick={() => createFilter.mutate()}>
            Add filter
          </Button>
        </div>
        {filters.data?.map((filter) => (
          <div key={filter.id} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Text variant="small">{filter.title}</Text>
                <Badge size="small" color={filter.action === "hide" ? "red" : "blue"}>{filter.action}</Badge>
                {filter.keywords.some((item) => item.semanticModel === SEMANTIC_MODEL_OPENAI)
                  ? <Badge size="small">OpenAI</Badge>
                  : filter.keywords.some((item) => item.semantic)
                    ? <Badge size="small">EmbeddingGemma</Badge>
                    : null}
              </div>
              <Text variant="mini" color="tertiary" truncate>{filter.keywords.map((item) => item.keyword).join(", ")}</Text>
            </div>
            <Button size="small" variant="transparent" iconOnly aria-label={`Delete filter ${filter.title}`} disabled={removeFilter.isPending} onClick={() => removeFilter.mutate(filter.id)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </section>

      {aiEnabled ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><Sparkles className="size-4" /><Text variant="strong">AI suggestions</Text></div>
          <Text variant="small" color="tertiary">
            Based on what you already block, mute, and filter — generated fresh each time, not stored.
          </Text>
          {suggestions.data?.keywords
            .filter((item) => !dismissed.has(`keyword:${item.keyword}`))
            .map((item) => (
              <div key={`keyword:${item.keyword}`} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Text variant="small">Filter keyword: {item.keyword}</Text>
                  <Text variant="mini" color="tertiary" truncate>{item.reason}</Text>
                </div>
                <Button
                  size="small"
                  variant="filled"
                  disabled={acceptKeywordSuggestion.isPending}
                  onClick={() => acceptKeywordSuggestion.mutate(item)}
                >
                  Accept
                </Button>
                <Button
                  size="small"
                  variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`keyword:${item.keyword}`))}
                >
                  Dismiss
                </Button>
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
                <Button
                  size="small"
                  variant="filled"
                  disabled={acceptAccountSuggestion.isPending}
                  onClick={() => acceptAccountSuggestion.mutate(item)}
                >
                  Accept
                </Button>
                <Button
                  size="small"
                  variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`account:${item.acct}`))}
                >
                  Dismiss
                </Button>
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
                <Button
                  size="small"
                  variant="transparent"
                  onClick={() => setDismissed((prev) => new Set(prev).add(`domain:${item.domain}`))}
                >
                  Dismiss
                </Button>
              </div>
            ))}
          {suggestions.data
            && !suggestions.data.keywords.length && !suggestions.data.accounts.length && !suggestions.data.domains.length ? (
            <Text variant="small" color="tertiary">Nothing to suggest right now.</Text>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
