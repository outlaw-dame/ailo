import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, FileText } from "lucide-react";
import { Badge, List, Text } from "@glaze/core/components";

import { excerptFromBody, formatRelativeDate } from "../lib/markdown";
import type { Post } from "../lib/types";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const navigate = useNavigate();
  const excerpt = post.contentWarning
    ? post.contentWarning
    : excerptFromBody(post.body) || "No content yet";

  return (
    <List.Item
      item={post}
      onClick={() => {
        void navigate({ to: "/post/$postId", params: { postId: post.id } });
      }}
    >
      <List.ItemIcon>
        {post.contentWarning ? (
          <AlertTriangle className="size-4 text-support-yellow" />
        ) : (
          <FileText className="size-4 text-secondary" />
        )}
      </List.ItemIcon>
      <List.ItemContent>
        <List.ItemTitle>{post.title || "Untitled"}</List.ItemTitle>
        <List.ItemDescription>
          {post.contentWarning ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-support-yellow">CW</span>
              <span>· {excerpt}</span>
            </span>
          ) : (
            excerpt
          )}
        </List.ItemDescription>
      </List.ItemContent>
      <List.ItemAccessory>
        <div className="flex flex-col items-end gap-1">
          <Text variant="mini" color="tertiary" className="tabular-nums">
            {formatRelativeDate(post.updatedAt)}
          </Text>
          <Badge color={post.status === "published" ? "green" : "secondary"} size="small">
            {post.status === "published" ? "Published" : "Draft"}
          </Badge>
        </div>
      </List.ItemAccessory>
    </List.Item>
  );
}
