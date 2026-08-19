import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FolderHeart, Trash2, UserPlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Input, Label, Switch, Text, Textarea, toast } from "@glaze/core/components";

import { api } from "../lib/api";

export function FediverseDiscover() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [discoverable, setDiscoverable] = React.useState(true);
  const [importUrl, setImportUrl] = React.useState("");
  const [previewedInput, setPreviewedInput] = React.useState("");
  const suggestions = useQuery({
    queryKey: ["fedipod", "suggestions"], queryFn: api.fedipod.suggestions,
  });
  const collections = useQuery({
    queryKey: ["fedipod", "collections"], queryFn: api.fedipod.collections,
  });
  const sources = useQuery({
    queryKey: ["fedipod", "collection-sources"], queryFn: api.fedipod.collectionSources,
  });
  const refreshCollections = () =>
    queryClient.invalidateQueries({ queryKey: ["fedipod", "collections"] });
  const follow = useMutation({
    mutationFn: (id: string) => api.fedipod.follow(id, true),
    onSuccess: () => toast.success(t("discover.accountFollowed")),
    onError: (error: Error) => toast.error(error.message),
  });
  const dismiss = useMutation({
    mutationFn: api.fedipod.dismissSuggestion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fedipod", "suggestions"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const create = useMutation({
    mutationFn: () => api.fedipod.createCollection({ name, description, discoverable }),
    onSuccess: async () => {
      setName(""); setDescription(""); await refreshCollections();
      toast.success(t("discover.collectionCreated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: api.fedipod.deleteCollection,
    onSuccess: refreshCollections,
    onError: (error: Error) => toast.error(error.message),
  });
  const add = useMutation({
    mutationFn: ({ collectionId, accountId }: { collectionId: string; accountId: string }) =>
      api.fedipod.addCollectionAccount(collectionId, accountId),
    onSuccess: async () => { await refreshCollections(); toast.success(t("discover.collectionInviteSent")); },
    onError: (error: Error) => toast.error(error.message),
  });
  const preview = useMutation({
    mutationFn: api.fedipod.previewCollectionSource,
    onSuccess: () => setPreviewedInput(importUrl.trim()),
    onError: (error: Error) => { setPreviewedInput(""); toast.error(error.message); },
  });
  const importSource = useMutation({
    mutationFn: api.fedipod.importCollectionSource,
    onSuccess: async (result) => {
      await refreshCollections();
      const failures = result.failedCount ? t("discover.importFailures", { count: result.failedCount }) : "";
      const changes = [
        result.addedCount ? t("discover.importAdded", { count: result.addedCount }) : "",
        result.removedCount ? t("discover.importRemoved", { count: result.removedCount }) : "",
      ].filter(Boolean).join(", ");
      toast.success(result.alreadyImported
        ? t("discover.importAlreadyCurrent", { failures })
        : t("discover.importRefreshed", {
          changes: changes || t("discover.importAccountsCount", { count: result.accountCount }),
          failures,
        }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2"><UserPlus className="size-4" /><Text variant="strong">{t("discover.suggestionsTitle")}</Text></div>
        <Text variant="small" color="tertiary">{t("discover.suggestionsDescription")}</Text>
        {suggestions.isError ? <Text color="danger">{(suggestions.error as Error).message}</Text> : null}
        {suggestions.data?.map(({ account, source }) => (
          <div key={account.id} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
            <img src={account.avatar} alt="" className="size-9 rounded-full bg-control-subtle object-cover" />
            <div className="min-w-0 flex-1">
              <Text variant="small-strong" truncate>{account.displayName}</Text>
              <Text variant="mini" color="tertiary" truncate>@{account.acct || account.username} · {source.replace(/_/g, " ")}</Text>
            </div>
            {collections.data?.length ? (
              <select
                aria-label={t("customFeeds.listAddToAriaLabel", { name: account.displayName })}
                className="max-w-36 rounded-control border border-secondary bg-control-subtle px-2 py-1 text-sm"
                defaultValue=""
                disabled={add.isPending}
                onChange={(event) => {
                  if (event.target.value) add.mutate({ collectionId: event.target.value, accountId: account.id });
                  event.currentTarget.value = "";
                }}
              >
                <option value="">{t("customFeeds.listAddToPlaceholder")}</option>
                {collections.data.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
              </select>
            ) : null}
            <Button size="small" variant="filled" disabled={follow.isPending} onClick={() => follow.mutate(account.id)}>{t("common.follow")}</Button>
            <Button size="small" variant="transparent" iconOnly aria-label={t("discover.dismissSuggestionAriaLabel", { name: account.displayName })} disabled={dismiss.isPending} onClick={() => dismiss.mutate(account.id)}><X /></Button>
          </div>
        ))}
        {!suggestions.isLoading && !suggestions.data?.length ? <Text variant="small" color="tertiary">{t("discover.suggestionsEmpty")}</Text> : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2"><FolderHeart className="size-4" /><Text variant="strong">{t("discover.collectionsTitle")}</Text></div>
        <Text variant="small" color="tertiary">{t("discover.collectionsDescription")}</Text>
        <div className="flex flex-col gap-2 rounded-card border border-secondary bg-well/30 p-3">
          <Text variant="small-strong">{t("discover.directoriesTitle")}</Text>
          <Text variant="mini" color="tertiary">
            {t("discover.directoriesDescription")}
          </Text>
          {sources.data?.map((source) => (
            <div key={source.id} className="flex items-start gap-2 rounded-control border border-secondary px-3 py-2">
              <div className="min-w-0 flex-1">
                <Text variant="small-strong">{source.name}</Text>
                <Text variant="mini" color="tertiary">{source.description}</Text>
                <Text variant="mini" color="secondary">{source.importHint}</Text>
              </div>
              <Button size="small" variant="transparent" iconOnly aria-label={t("discover.sourceOpen", { name: source.name })}
                onClick={() => void api.app.openExternal(source.url)}><ExternalLink /></Button>
              {source.id === "wordpress-community" ? (
                <Button size="small" variant="transparent" onClick={() => {
                  setImportUrl(source.url); setPreviewedInput("");
                }}>{t("discover.selectSource")}</Button>
              ) : null}
            </div>
          ))}
          {sources.isError ? <Text color="danger">{(sources.error as Error).message}</Text> : null}
          <Label className="flex flex-col items-stretch gap-1.5">
            <Text variant="mini" color="secondary">{t("discover.directoriesUrlLabel")}</Text>
            <Input value={importUrl} placeholder={t("discover.directoriesUrlPlaceholder")}
              onChange={(event) => { setImportUrl(event.target.value); setPreviewedInput(""); }} />
          </Label>
          <div className="flex items-center gap-2">
            <Button size="small" variant="filled" disabled={!importUrl.trim() || preview.isPending}
              onClick={() => preview.mutate(importUrl.trim())}>{t("discover.previewButton")}</Button>
            {preview.data && previewedInput === importUrl.trim() ? (
              <Text variant="small" className="min-w-0 flex-1" truncate>
                {t("discover.previewResult", { name: preview.data.name, count: preview.data.accountCount })}
              </Text>
            ) : null}
            <Button size="small" variant="accent"
              disabled={!preview.data || previewedInput !== importUrl.trim() || importSource.isPending}
              onClick={() => importSource.mutate(importUrl.trim())}>
              <Download />{importSource.isPending ? t("discover.importingButton") : t("discover.importButton")}
            </Button>
          </div>
        </div>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("discover.collectionNamePlaceholder")} maxLength={40} />
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("discover.collectionDescriptionPlaceholder")} maxLength={100} />
        <div className="flex items-center gap-2">
          <Label className="gap-2"><Switch checked={discoverable} onCheckedChange={setDiscoverable} />{t("discover.collectionDiscoverable")}</Label>
          <Button className="ml-auto" size="small" variant="accent" disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>{t("discover.createCollection")}</Button>
        </div>
        {collections.isError ? <Text color="danger">{(collections.error as Error).message}</Text> : null}
        {collections.data?.map((collection) => (
          <div key={collection.id} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
            <div className="min-w-0 flex-1">
              <Text variant="small-strong" truncate>{collection.name}</Text>
              <Text variant="mini" color="tertiary">
                {t("discover.collectionAccepted", { count: collection.items.filter((item) => item.state === "accepted").length })}
                {" · "}
                {t("discover.collectionPending", { count: collection.items.filter((item) => item.state === "pending").length })}
                {" · "}
                {collection.discoverable ? t("discover.discoverableStatus") : t("discover.privateStatus")}
              </Text>
              {collection.description ? <Text variant="small" color="secondary">{collection.description}</Text> : null}
              {collection.sourcePage ? (
                <Button size="small" variant="transparent" className="mt-1"
                  onClick={() => void api.app.openExternal(collection.sourcePage!)}>
                  <ExternalLink />{t("discover.sourceLink")}
                </Button>
              ) : null}
            </div>
            <Button size="small" variant="transparent" iconOnly aria-label={t("discover.deleteCollectionAriaLabel", { name: collection.name })} disabled={remove.isPending} onClick={() => { if (window.confirm(t("discover.deleteCollectionConfirm", { name: collection.name }))) remove.mutate(collection.id); }}><Trash2 /></Button>
          </div>
        ))}
      </section>
    </div>
  );
}
