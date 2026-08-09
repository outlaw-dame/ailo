import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Star, Trash2 } from "lucide-react";
import { Badge, Button, Input, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";

function cleanTag(value: string): string {
  return value.trim().replace(/^#/, "").normalize("NFC").toLowerCase();
}

export function FediverseTags() {
  const queryClient = useQueryClient();
  const [followInput, setFollowInput] = React.useState("");
  const [featureInput, setFeatureInput] = React.useState("");
  const followed = useQuery({
    queryKey: ["fedipod", "followed-tags"], queryFn: api.fedipod.followedTags,
  });
  const featured = useQuery({
    queryKey: ["fedipod", "featured-tags"], queryFn: api.fedipod.featuredTags,
  });
  const suggestions = useQuery({
    queryKey: ["fedipod", "featured-tag-suggestions"],
    queryFn: api.fedipod.featuredTagSuggestions,
  });

  const refreshFollowed = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fedipod", "followed-tags"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "timeline"] }),
    ]);
  };
  const refreshFeatured = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fedipod", "featured-tags"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "featured-tag-suggestions"] }),
    ]);
  };
  const follow = useMutation({
    mutationFn: ({ name, active }: { name: string; active: boolean }) =>
      api.fedipod.followTag(cleanTag(name), active),
    onSuccess: async (_tag, input) => {
      if (input.active) setFollowInput("");
      await refreshFollowed();
      toast.success(input.active ? "Hashtag followed" : "Hashtag unfollowed");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const feature = useMutation({
    mutationFn: (name: string) => api.fedipod.featureTag(cleanTag(name)),
    onSuccess: async () => {
      setFeatureInput("");
      await refreshFeatured();
      toast.success("Hashtag featured on your profile");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const unfeature = useMutation({
    mutationFn: api.fedipod.unfeatureTag,
    onSuccess: async () => {
      await refreshFeatured();
      toast.success("Featured hashtag removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Hash className="size-4" />
          <Text variant="strong">Followed hashtags</Text>
        </div>
        <Text variant="small" color="tertiary">
          Public posts using these hashtags are added to your home timeline by FediPod.
        </Text>
        <div className="flex gap-2">
          <Input value={followInput} onChange={(event) => setFollowInput(event.target.value)}
            placeholder="#fediverse" aria-label="Hashtag to follow" maxLength={101} />
          <Button size="small" variant="accent" disabled={follow.isPending || !cleanTag(followInput)}
            onClick={() => follow.mutate({ name: followInput, active: true })}>Follow</Button>
        </div>
        {followed.isError ? <Text variant="small" color="danger">{(followed.error as Error).message}</Text> : null}
        {followed.data?.length ? (
          <div className="flex flex-wrap gap-2">
            {followed.data.map((tag) => (
              <Badge key={tag.id} size="small">
                #{tag.name}
                <Button size="small" variant="transparent" iconOnly aria-label={`Unfollow #${tag.name}`}
                  disabled={follow.isPending}
                  onClick={() => follow.mutate({ name: tag.name, active: false })}>
                  <Trash2 />
                </Button>
              </Badge>
            ))}
          </div>
        ) : !followed.isLoading ? <Text variant="small" color="tertiary">No followed hashtags.</Text> : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Star className="size-4" />
          <Text variant="strong">Featured hashtags</Text>
        </div>
        <Text variant="small" color="tertiary">
          Show up to ten hashtags on your fediverse profile. Counts reflect your own posts.
        </Text>
        <div className="flex gap-2">
          <Input value={featureInput} onChange={(event) => setFeatureInput(event.target.value)}
            placeholder="#mywriting" aria-label="Hashtag to feature" maxLength={101} />
          <Button size="small" variant="accent"
            disabled={feature.isPending || !cleanTag(featureInput) || (featured.data?.length ?? 0) >= 10}
            onClick={() => feature.mutate(featureInput)}>Feature</Button>
        </div>
        {featured.isError ? <Text variant="small" color="danger">{(featured.error as Error).message}</Text> : null}
        {featured.data?.map((tag) => (
          <div key={tag.id} className="flex items-center gap-3 rounded-control border border-secondary px-3 py-2">
            <div className="min-w-0 flex-1">
              <Text variant="small">#{tag.name}</Text>
              <Text variant="mini" color="tertiary">
                {tag.statusesCount} {tag.statusesCount === 1 ? "post" : "posts"}
                {tag.lastStatusAt ? ` · last used ${tag.lastStatusAt}` : ""}
              </Text>
            </div>
            <Button size="small" variant="transparent" iconOnly aria-label={`Unfeature #${tag.name}`}
              disabled={unfeature.isPending} onClick={() => unfeature.mutate(tag.id)}><Trash2 /></Button>
          </div>
        ))}
        {suggestions.data?.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="mini" color="tertiary">Recently used:</Text>
            {suggestions.data.map((tag) => (
              <Button key={tag.id} size="small" variant="filled" disabled={feature.isPending}
                onClick={() => feature.mutate(tag.name)}>#{tag.name}</Button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
