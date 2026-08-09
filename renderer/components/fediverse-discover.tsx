import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderHeart, Trash2, UserPlus, X } from "lucide-react";
import { Button, Input, Label, Switch, Text, Textarea, toast } from "@glaze/core/components";

import { api } from "../lib/api";

export function FediverseDiscover() {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [discoverable, setDiscoverable] = React.useState(true);
  const suggestions = useQuery({
    queryKey: ["fedipod", "suggestions"], queryFn: api.fedipod.suggestions,
  });
  const collections = useQuery({
    queryKey: ["fedipod", "collections"], queryFn: api.fedipod.collections,
  });
  const refreshCollections = () =>
    queryClient.invalidateQueries({ queryKey: ["fedipod", "collections"] });
  const follow = useMutation({
    mutationFn: (id: string) => api.fedipod.follow(id, true),
    onSuccess: () => toast.success("Account followed"),
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
      toast.success("Collection created");
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
    onSuccess: async () => { await refreshCollections(); toast.success("Collection invitation sent"); },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2"><UserPlus className="size-4" /><Text variant="strong">Suggested accounts</Text></div>
        <Text variant="small" color="tertiary">Recommendations from your FediPod activity. Dismissed accounts stay dismissed.</Text>
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
                aria-label={`Add ${account.displayName} to collection`}
                className="max-w-36 rounded-control border border-secondary bg-control-subtle px-2 py-1 text-sm"
                defaultValue=""
                disabled={add.isPending}
                onChange={(event) => {
                  if (event.target.value) add.mutate({ collectionId: event.target.value, accountId: account.id });
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Add to…</option>
                {collections.data.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
              </select>
            ) : null}
            <Button size="small" variant="filled" disabled={follow.isPending} onClick={() => follow.mutate(account.id)}>Follow</Button>
            <Button size="small" variant="transparent" iconOnly aria-label={`Dismiss ${account.displayName}`} disabled={dismiss.isPending} onClick={() => dismiss.mutate(account.id)}><X /></Button>
          </div>
        ))}
        {!suggestions.isLoading && !suggestions.data?.length ? <Text variant="small" color="tertiary">No account suggestions right now.</Text> : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2"><FolderHeart className="size-4" /><Text variant="strong">Collections</Text></div>
        <Text variant="small" color="tertiary">Public recommendations of accounts. Invited accounts remain pending until they consent.</Text>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Collection name" maxLength={40} />
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" maxLength={100} />
        <div className="flex items-center gap-2">
          <Label className="gap-2"><Switch checked={discoverable} onCheckedChange={setDiscoverable} />Discoverable</Label>
          <Button className="ml-auto" size="small" variant="accent" disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>Create collection</Button>
        </div>
        {collections.isError ? <Text color="danger">{(collections.error as Error).message}</Text> : null}
        {collections.data?.map((collection) => (
          <div key={collection.id} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
            <div className="min-w-0 flex-1">
              <Text variant="small-strong" truncate>{collection.name}</Text>
              <Text variant="mini" color="tertiary">{collection.items.filter((item) => item.state === "accepted").length} accepted · {collection.items.filter((item) => item.state === "pending").length} pending · {collection.discoverable ? "discoverable" : "private"}</Text>
              {collection.description ? <Text variant="small" color="secondary">{collection.description}</Text> : null}
            </div>
            <Button size="small" variant="transparent" iconOnly aria-label={`Delete ${collection.name}`} disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete “${collection.name}”?`)) remove.mutate(collection.id); }}><Trash2 /></Button>
          </div>
        ))}
      </section>
    </div>
  );
}
