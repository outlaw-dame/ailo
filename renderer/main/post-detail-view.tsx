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
import { formatRelativeDate } from "../lib/markdown";

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
      toast.success("Note deleted");
      void navigate({ to: "/" });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not delete note");
    },
  });

  const post = postQuery.data;

  return (
    <ScrollArea
      title={post?.title || (postQuery.isLoading ? "Loading…" : "Note")}
      subtitle={
        post
          ? `${post.status === "published" ? "Published" : "Draft"} · ${formatRelativeDate(post.updatedAt)}`
          : undefined
      }
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
                if (window.confirm("Delete this note? This cannot be undone.")) {
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
        <div className="px-8 py-6 flex flex-col gap-3">
          <div className="h-8 w-2/3 rounded-control bg-control-subtle animate-pulse" />
          <div className="h-4 w-full rounded-control bg-control-subtle animate-pulse" />
          <div className="h-4 w-5/6 rounded-control bg-control-subtle animate-pulse" />
        </div>
      ) : !post ? (
        <div className="px-8 py-10">
          <Text color="secondary">This note could not be found.</Text>
        </div>
      ) : (
        <article className="px-8 py-6 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Badge color={post.status === "published" ? "green" : "secondary"}>
              {post.status === "published" ? "Published" : "Draft"}
            </Badge>
            {post.contentWarning ? <Badge color="yellow">Content warning</Badge> : null}
            {post.tags.map((tag) => (
              <Badge key={tag} color="blue">
                {tag}
              </Badge>
            ))}
          </div>

          {post.contentWarning ? (
            <ContentWarningGate warning={post.contentWarning}>
              <MarkdownPreview body={post.body} altTexts={post.altTexts} />
            </ContentWarningGate>
          ) : (
            <MarkdownPreview body={post.body} altTexts={post.altTexts} />
          )}

          {(post.solidUrl || post.githubPath) && (
            <div className="mt-8 pt-5 border-t border-separator flex flex-col gap-2">
              <Text variant="small-strong" color="tertiary">
                Published to
              </Text>
              {post.solidUrl ? (
                <a
                  href={post.solidUrl}
                  className="inline-flex items-center gap-1.5 text-small text-accent hover:underline min-w-0"
                  onClick={(event) => {
                    event.preventDefault();
                    void window.glazeAPI.glaze.ipc.invoke("app:openExternal", post.solidUrl);
                  }}
                >
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="truncate">{post.solidUrl}</span>
                </a>
              ) : null}
              {post.githubPath ? (
                <Text variant="small" color="secondary" className="truncate">
                  GitHub · {post.githubPath}
                </Text>
              ) : null}
            </div>
          )}
        </article>
      )}
    </ScrollArea>
  );
}
