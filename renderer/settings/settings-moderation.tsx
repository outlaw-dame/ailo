import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, ListFilter, Pencil, ShieldBan, Trash2, VolumeX, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Input,
  Label,
  SegmentedControl,
  SegmentedControlItem,
  Switch,
  Text,
  Textarea,
  toast,
} from "@glaze/core/components";

import { api } from "../lib/api";
import { semanticFilterService } from "../lib/semantic-filter-service";
import { SEMANTIC_MODEL_GEMINI, SEMANTIC_MODEL_LOCAL, SEMANTIC_MODEL_OPENAI } from "../lib/types";
import type { FilterInput, MastodonAccount, MastodonFilter } from "../lib/types";
import { ModerationWeeklySummary } from "../components/moderation-weekly-summary";

// One keyword/phrase per line, same raw-text-until-save shape
// custom-feed-editor.tsx already uses for its own list fields — feeding a
// parsed array back into a controlled textarea on every keystroke is what
// silently ate the newline Enter leaves before the next line's first
// character, so a second keyword looked impossible to add.
const filterLines = (value: string) => [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];

function AccountRow({
  account,
  action,
  pending,
}: {
  account: MastodonAccount;
  action: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
      <img src={account.avatar} alt="" className="size-8 rounded-full bg-control-subtle object-cover" />
      <div className="min-w-0 flex-1">
        <Text variant="small" truncate>{account.displayName}</Text>
        <Text variant="mini" color="tertiary" truncate>@{account.acct || account.username}</Text>
      </div>
      <Button size="small" variant="filled" disabled={pending} onClick={action}>{t("common.remove")}</Button>
    </div>
  );
}

/** Blocks, domain blocks, mutes, keyword/semantic filters, and AI-suggested
 * additions to any of the above — previously a Fediverse-view tab ("Safety"),
 * moved under Settings since it's account configuration, not a feed. */
export function ModerationSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingFilterId, setEditingFilterId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [keywordsText, setKeywordsText] = React.useState("");
  const [wholeWord, setWholeWord] = React.useState(false);
  const [action, setAction] = React.useState<"warn" | "hide">("warn");
  const [semanticThreshold, setSemanticThreshold] = React.useState("0.60");
  const [semanticBackend, setSemanticBackend] = React.useState(SEMANTIC_MODEL_LOCAL);
  const [domain, setDomain] = React.useState("");

  const blocks = useQuery({ queryKey: ["fedipod", "blocks"], queryFn: api.fedipod.blocks });
  const mutes = useQuery({ queryKey: ["fedipod", "mutes"], queryFn: api.fedipod.mutes });
  const domainBlocks = useQuery({ queryKey: ["fedipod", "domain-blocks"], queryFn: api.fedipod.domainBlocks });
  const filters = useQuery({ queryKey: ["fedipod", "filters"], queryFn: api.fedipod.filters });
  const aiStatus = useQuery({ queryKey: ["fedipod", "ai", "status"], queryFn: api.ai.status });

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
  const setDomainBlock = useMutation({
    mutationFn: ({ value, active }: { value: string; active: boolean }) =>
      api.fedipod.setDomainBlock(value, active),
    onSuccess: async (_result, variables) => {
      if (variables.active) setDomain("");
      await refresh();
      toast.success(variables.active ? t("moderation.domainBlockSuccess") : t("moderation.domainUnblockSuccess"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resetFilterForm = () => {
    setEditingFilterId(null);
    setTitle("");
    setKeywordsText("");
    setWholeWord(false);
    setAction("warn");
  };
  const startEditFilter = (filter: MastodonFilter) => {
    setEditingFilterId(filter.id);
    setTitle(filter.title);
    setKeywordsText(filter.keywords.map((item) => item.keyword).join("\n"));
    setWholeWord(filter.keywords.some((item) => item.wholeWord));
    setAction(filter.action === "hide" ? "hide" : "warn");
    const withModel = filter.keywords.find((item) => item.semanticModel);
    if (withModel?.semanticThreshold != null) setSemanticThreshold(String(withModel.semanticThreshold));
    if (withModel?.semanticModel) setSemanticBackend(withModel.semanticModel);
  };
  const saveFilter = useMutation({
    mutationFn: async () => {
      // Only the local model needs its ~230 MB weights downloaded/cached;
      // OpenAI-backed keywords are matched server-side, nothing to load here.
      if (semanticBackend === SEMANTIC_MODEL_LOCAL) await semanticFilterService.ensureAvailable();
      const input: FilterInput = {
        title,
        action,
        keywords: filterLines(keywordsText).map((keyword) => ({
          keyword,
          wholeWord,
          semantic: true,
          semanticThreshold: Number(semanticThreshold),
          semanticModel: semanticBackend,
        })),
      };
      return editingFilterId ? api.fedipod.updateFilter(editingFilterId, input) : api.fedipod.createFilter(input);
    },
    onSuccess: async () => {
      const wasEditing = editingFilterId !== null;
      resetFilterForm();
      await refresh();
      toast.success(wasEditing ? t("moderation.filterUpdated") : t("moderation.filterCreated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeFilter = useMutation({
    mutationFn: api.fedipod.deleteFilter,
    onSuccess: (_result, id) => { if (id === editingFilterId) resetFilterForm(); return refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-5">
      <ModerationWeeklySummary />
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><ShieldBan className="size-4" /><Text variant="strong">{t("moderation.blockedAccountsSectionTitle")}</Text></div>
        {blocks.data?.length ? blocks.data.map((account) => (
          <AccountRow key={account.id} account={account} pending={unblock.isPending} action={() => unblock.mutate(account.id)} />
        )) : <Text variant="small" color="tertiary">{t("moderation.noBlockedAccounts")}</Text>}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><Globe2 className="size-4" /><Text variant="strong">{t("moderation.blockedDomainsSectionTitle")}</Text></div>
        <Text variant="small" color="tertiary">{t("moderation.blockedDomainsNote")}</Text>
        <div className="flex gap-2">
          <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder={t("moderation.domainBlockPlaceholder")} aria-label={t("moderation.domainBlockAriaLabel")} maxLength={253} />
          <Button size="small" variant="filled" disabled={!domain.trim() || setDomainBlock.isPending} onClick={() => setDomainBlock.mutate({ value: domain, active: true })}>{t("moderation.blockDomainButton")}</Button>
        </div>
        {domainBlocks.data?.length ? domainBlocks.data.map((value) => (
          <div key={value} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
            <Text variant="small" className="min-w-0 flex-1" truncate>{value}</Text>
            <Button size="small" variant="transparent" disabled={setDomainBlock.isPending} onClick={() => setDomainBlock.mutate({ value, active: false })}>{t("common.remove")}</Button>
          </div>
        )) : <Text variant="small" color="tertiary">{t("moderation.noBlockedDomains")}</Text>}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><VolumeX className="size-4" /><Text variant="strong">{t("moderation.mutedAccountsSectionTitle")}</Text></div>
        {mutes.data?.length ? mutes.data.map((account) => (
          <AccountRow key={account.id} account={account} pending={unmute.isPending} action={() => unmute.mutate(account.id)} />
        )) : <Text variant="small" color="tertiary">{t("moderation.noMutedAccounts")}</Text>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ListFilter className="size-4" /><Text variant="strong">{t("moderation.filtersTitle")}</Text>
          {editingFilterId ? <Badge size="small" color="blue">{t("moderation.filterEditingBadge")}</Badge> : null}
        </div>
        <Text variant="small" color="tertiary">
          {t("moderation.filtersDescription")}
        </Text>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("moderation.filterNamePlaceholder")} aria-label={t("moderation.filterNameAriaLabel")} maxLength={200} />
        <label className="flex flex-col gap-1.5">
          <Text variant="mini" color="tertiary">{t("moderation.keywordsNote")}</Text>
          <Textarea
            value={keywordsText}
            onChange={(event) => setKeywordsText(event.target.value)}
            placeholder={t("moderation.keywordsPlaceholder")}
            aria-label={t("moderation.keywordsAriaLabel")}
            rows={3}
            maxLength={5000}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl size="small" value={action} onValueChange={(value) => setAction(value as "warn" | "hide")} aria-label={t("moderation.filterActionAriaLabel")}>
            <SegmentedControlItem value="warn">{t("moderation.filterActionWarn")}</SegmentedControlItem>
            <SegmentedControlItem value="hide">{t("moderation.filterActionHide")}</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedControl size="small" value={semanticThreshold} onValueChange={setSemanticThreshold} aria-label={t("moderation.semanticSensitivityAriaLabel")}>
            <SegmentedControlItem value="0.67">{t("moderation.semanticStrict")}</SegmentedControlItem>
            <SegmentedControlItem value="0.60">{t("moderation.semanticBalanced")}</SegmentedControlItem>
            <SegmentedControlItem value="0.54">{t("moderation.semanticBroad")}</SegmentedControlItem>
          </SegmentedControl>
          {aiStatus.data?.providers.length ? (
            <SegmentedControl
              size="small"
              value={semanticBackend}
              onValueChange={setSemanticBackend}
              aria-label={t("moderation.semanticBackendAriaLabel")}
            >
              <SegmentedControlItem value={SEMANTIC_MODEL_LOCAL}>{t("moderation.semanticLocal")}</SegmentedControlItem>
              {aiStatus.data.providers.includes("openai") ? (
                <SegmentedControlItem value={SEMANTIC_MODEL_OPENAI}>{t("moderation.semanticOpenAI")}</SegmentedControlItem>
              ) : null}
              {aiStatus.data.providers.includes("gemini") ? (
                <SegmentedControlItem value={SEMANTIC_MODEL_GEMINI}>{t("moderation.semanticGemini")}</SegmentedControlItem>
              ) : null}
            </SegmentedControl>
          ) : null}
          <Label className="gap-2"><Switch checked={wholeWord} onCheckedChange={setWholeWord} />{t("moderation.wholeWordLabel")}</Label>
          <div className="ml-auto flex items-center gap-2">
            {editingFilterId ? (
              <Button size="small" variant="transparent" onClick={resetFilterForm}><X />{t("moderation.filterCancelButton")}</Button>
            ) : null}
            <Button size="small" variant="accent" disabled={saveFilter.isPending || !title.trim() || !filterLines(keywordsText).length} onClick={() => saveFilter.mutate()}>
              {editingFilterId ? t("moderation.filterSaveButton") : t("moderation.filterAddButton")}
            </Button>
          </div>
        </div>
        {filters.data?.map((filter) => (
          <div key={filter.id} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Text variant="small">{filter.title}</Text>
                <Badge size="small" color={filter.action === "hide" ? "red" : "blue"}>
                  {filter.action === "hide" ? t("moderation.filterBadgeHide") : t("moderation.filterBadgeWarn")}
                </Badge>
                {filter.keywords.some((item) => item.semanticModel === SEMANTIC_MODEL_OPENAI)
                  ? <Badge size="small">{t("moderation.semanticOpenAI")}</Badge>
                  : filter.keywords.some((item) => item.semanticModel === SEMANTIC_MODEL_GEMINI)
                    ? <Badge size="small">{t("moderation.semanticGemini")}</Badge>
                  : filter.keywords.some((item) => item.semantic)
                    ? <Badge size="small">{t("moderation.filterBadgeEmbeddingGemma")}</Badge>
                    : null}
              </div>
              <Text variant="mini" color="tertiary" truncate>{filter.keywords.map((item) => item.keyword).join(", ")}</Text>
            </div>
            <Button size="small" variant="transparent" iconOnly aria-label={t("moderation.filterEditAriaLabel", { title: filter.title })} onClick={() => startEditFilter(filter)}>
              <Pencil />
            </Button>
            <Button size="small" variant="transparent" iconOnly aria-label={t("moderation.filterDeleteAriaLabel", { title: filter.title })} disabled={removeFilter.isPending} onClick={() => removeFilter.mutate(filter.id)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </section>
    </div>
  );
}
