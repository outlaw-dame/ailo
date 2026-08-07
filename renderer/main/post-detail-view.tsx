import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  ScrollArea,
  Text,
  toast,
  ToolbarBackButton,
} from "@glaze/core/components";

import { ContentWarningGate } from "../components/content-warning-gate";
import { MarkdownPreview } from "../components/markdown-preview";
import { api } from "../lib/api";
import {
  firstImageSrc,
  formatLongDate,
  meshIndexForId,
} from "../lib/markdown";

export function PostDetailView() {
  const { postId } = useParams({ from: "/post/$postId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const postQuery = useQuery({
    queryKey: ["posts", postId],
    queryFn: () => api.posts.get(postId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.posts.remove(postId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Story deleted");
      void navigate({ to: "/" });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not delete story");
    },
  });

  const post = postQuery.data;
  const coverImage = post ? firstImageSrc(post.body) : null;
  const mesh = post ? `knot-mesh-${meshIndexForId(post.id)}` : "knot-mesh-0";
  const coverAlt =
    post?.altTexts.find((entry) => entry.src === coverImage)?.alt ||
    post?.title ||
    "Story cover";

  return (
    <ScrollArea
      title={post ? "" : postQuery.isLoading ? "Loading…" : "Story"}
      leading={
        <ToolbarBackButton
          onClick={() => {
            void navigate({ to: "/" });
          }}
        />
      }
      actions={
        post ? (
          <div className="flex items-center gap-1.5">
            <Button
              size="small"
              variant="transparent"
              onClick={() => {
                void navigate({ to: "/write/$postId", params: { postId: post.id } });
              }}
            >
              <Pencil />
              Edit
            </Button>
            <Button
              size="small"
              variant="transparent"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm("Delete this story? This cannot be undone.")) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ) : null
      }
      className="h-full"
    >
      {postQuery.isLoading ? (
        <div className="flex flex-col gap-4 px-8 py-6">
          <div className="h-56 w-full animate-pulse rounded-card bg-control-subtle" />
          <div className="mx-auto h-10 w-2/3 max-w-xl animate-pulse rounded-control bg-control-subtle" />
          <div className="mx-auto h-4 w-full max-w-xl animate-pulse rounded-control bg-control-subtle" />
          <div className="mx-auto h-4 w-5/6 max-w-xl animate-pulse rounded-control bg-control-subtle" />
        </div>
      ) : !post ? (
        <div className="px-8 py-10">
          <Text color="secondary">This story could not be found.</Text>
        </div>
      ) : (
        <article className="pb-16">
          <div className={`relative mx-6 mt-2 overflow-hidden rounded-card ${coverImage ? "" : mesh}`}>
            <div className="relative min-h-[220px] w-full sm:min-h-[280px]">
              {coverImage ? (
                <img
                  src={coverImage}
                  alt={coverAlt}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--fg)_72%,transparent)] via-[color-mix(in_oklab,var(--fg)_22%,transparent)] to-transparent" />
              <div className="relative z-10 flex min-h-[220px] flex-col justify-end gap-3 p-7 sm:min-h-[280px] sm:p-9">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={post.status === "published" ? "green" : "secondary"}>
                    {post.status === "published" ? "Published" : "Draft"}
                  </Badge>
                  {post.contentWarning ? <Badge color="yellow">Content warning</Badge> : null}
                  {post.tags.map((tag) => (
                    <Badge key={tag} color="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <Text
                  as="h1"
                  variant="heading1"
                  className="max-w-3xl text-balance text-[color-mix(in_oklab,var(--bg)_96%,white)]!"
                >
                  {post.title || "Untitled"}
                </Text>
                <Text
                  variant="small"
                  className="tabular-nums text-[color-mix(in_oklab,var(--bg)_72%,white)]!"
                >
                  {formatLongDate(post.publishedAt ?? post.updatedAt)}
                </Text>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-8 max-w-[42rem] px-8">
            {post.contentWarning ? (
              <ContentWarningGate warning={post.contentWarning}>
                <MarkdownPreview body={post.body} altTexts={post.altTexts} />
              </ContentWarningGate>
            ) : (
              <MarkdownPreview body={post.body} altTexts={post.altTexts} />
            )}

            {(post.solidUrl || post.githubPath) && (
              <div className="mt-12 flex flex-col gap-2 border-t border-separator pt-6">
                <Text variant="small-strong" color="tertiary">
                  Shared on the open web
                </Text>
                {post.solidUrl ? (
                  <a
                    href={post.solidUrl}
                    className="inline-flex min-w-0 items-center gap-1.5 text-small text-accent hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      void window.glazeAPI.glaze.ipc.invoke("app:openExternal", post.solidUrl);
                    }}
                  >
                    <ExternalLink className="size-3.5 shrink-0" />
                    <span className="truncate">Solid Pod</span>
                  </a>
                ) : null}
                {post.githubPath ? (
                  <Text variant="small" color="secondary" className="truncate">
                    GitHub · {post.githubPath}
                  </Text>
                ) : null}
              </div>
            )}
          </div>
        </article>
      )}
    </ScrollArea>
  );
}
