import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import { Button, EmptyState, ScrollArea, Text } from "@glaze/core/components";
import { useTranslation } from "react-i18next";

import { PostCard } from "../components/post-card";
import { StoryCover } from "../components/story-cover";
import { api } from "../lib/api";

export function FeedView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const postsQuery = useQuery({
    queryKey: ["posts"],
    queryFn: () => api.posts.list(),
  });

  const posts = postsQuery.data ?? [];
  const published = posts.filter((post) => post.status === "published");
  const drafts = posts.filter((post) => post.status === "draft");

  const cover = published[0] ?? posts[0] ?? null;
  const restPublished = published.filter((post) => post.id !== cover?.id);
  const restDrafts = drafts.filter((post) => post.id !== cover?.id);

  return (
    <ScrollArea
      title={t("stories.title")}
      subtitle={
        postsQuery.isLoading
          ? t("stories.subtitleLoading")
          : posts.length === 0
            ? t("stories.subtitleEmpty")
            : t("stories.subtitleCount", { count: posts.length })
      }
      actions={
        <Button
          variant="accent"
          size="small"
          onClick={() => {
            void navigate({ to: "/write" });
          }}
        >
          <PenLine />
          {t("stories.compose")}
        </Button>
      }
      className="h-full"
    >
      {postsQuery.isLoading ? (
        <div className="flex flex-col gap-5 px-6 py-5">
          <div className="h-[320px] w-full animate-pulse rounded-card bg-control-subtle" />
          <div className="h-36 w-full animate-pulse rounded-card bg-control-subtle" />
          <div className="h-36 w-full animate-pulse rounded-card bg-control-subtle" />
        </div>
      ) : posts.length === 0 ? (
        <div className="relative flex min-h-[calc(100%-1px)] flex-col">
          <div className="knot-mesh-0 pointer-events-none absolute inset-x-6 top-4 h-56 rounded-card opacity-70" />
          <EmptyState
            title={t("stories.emptyTitle")}
            description={t("stories.emptyDescription")}
            actions={
              <Button
                variant="accent"
                onClick={() => {
                  void navigate({ to: "/write" });
                }}
              >
                <PenLine />
                {t("stories.emptyAction")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8 px-6 pb-12 pt-4">
          {cover ? (
            <section className="flex flex-col gap-3">
              <Text variant="small-strong" color="tertiary" className="px-0.5 tracking-wide uppercase">
                {t("stories.sectionToday")}
              </Text>
              <StoryCover post={cover} />
            </section>
          ) : null}

          {restPublished.length > 0 ? (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3 px-0.5">
                <Text variant="small-strong" color="tertiary" className="tracking-wide uppercase">
                  {t("stories.sectionMore")}
                </Text>
                <Text variant="mini" color="quaternary" className="tabular-nums">
                  {restPublished.length}
                </Text>
              </div>
              <div className="flex flex-col gap-3">
                {restPublished.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          ) : null}

          {restDrafts.length > 0 ? (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3 px-0.5">
                <Text variant="small-strong" color="tertiary" className="tracking-wide uppercase">
                  {t("stories.sectionDrafts")}
                </Text>
                <Text variant="mini" color="quaternary" className="tabular-nums">
                  {t("stories.draftCount", { count: restDrafts.length })}
                </Text>
              </div>
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                {restDrafts.map((post) => (
                  <PostCard key={post.id} post={post} compact />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </ScrollArea>
  );
}
