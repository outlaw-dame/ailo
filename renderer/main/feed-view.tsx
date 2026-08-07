import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import {
  Button,
  EmptyState,
  List,
  ScrollArea,
  Text,
} from "@glaze/core/components";

import { PostCard } from "../components/post-card";
import { api } from "../lib/api";

export function FeedView() {
  const navigate = useNavigate();
  const postsQuery = useQuery({
    queryKey: ["posts"],
    queryFn: () => api.posts.list(),
  });

  const posts = postsQuery.data ?? [];
  const published = posts.filter((post) => post.status === "published");
  const drafts = posts.filter((post) => post.status === "draft");

  return (
    <ScrollArea
      title="Feed"
      subtitle={postsQuery.isLoading ? "Loading…" : `${posts.length} note${posts.length === 1 ? "" : "s"}`}
      actions={
        <Button
          variant="accent"
          size="small"
          onClick={() => {
            void navigate({ to: "/write" });
          }}
        >
          <PenLine />
          New
        </Button>
      }
      className="h-full"
    >
      {postsQuery.isLoading ? (
        <div className="px-5 py-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-control bg-control-subtle animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          title="Share your first idea"
          description="Knot is a tiny place to write knowledge down and publish it to your Solid Pod and GitHub. Markdown, HTML, and emoji welcome."
          actions={
            <Button
              variant="accent"
              onClick={() => {
                void navigate({ to: "/write" });
              }}
            >
              <PenLine />
              Write a note
            </Button>
          }
        />
      ) : (
        <div className="pb-8">
          {published.length > 0 ? (
            <div className="px-3 pt-2">
              <Text variant="small-strong" color="tertiary" className="px-2 py-1.5">
                Published
              </Text>
              <List.Root items={published} getItemKey={(post) => post.id}>
                {published.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </List.Root>
            </div>
          ) : null}

          {drafts.length > 0 ? (
            <div className="px-3 pt-4">
              <Text variant="small-strong" color="tertiary" className="px-2 py-1.5">
                Drafts
              </Text>
              <List.Root items={drafts} getItemKey={(post) => post.id}>
                {drafts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </List.Root>
            </div>
          ) : null}
        </div>
      )}
    </ScrollArea>
  );
}
