import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Text } from "@glaze/core/components";

import {
  excerptFromBody,
  firstImageSrc,
  formatRelativeDate,
  meshIndexForId,
} from "../lib/markdown";
import type { Post } from "../lib/types";

interface PostCardProps {
  post: Post;
  compact?: boolean;
}

/**
 * Magazine story card — Paper's browsable unit, sized for a tiny personal blog.
 */
export function PostCard({ post, compact = false }: PostCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const image = firstImageSrc(post.body);
  const mesh = `knot-mesh-${meshIndexForId(post.id)}`;
  const excerpt = post.contentWarning
    ? post.contentWarning
    : excerptFromBody(post.body, compact ? 100 : 140) || t("postDetail.noContentYet");
  const alt =
    post.altTexts.find((entry) => entry.src === image)?.alt || post.title || t("postDetail.imageAlt");

  return (
    <button
      type="button"
      onClick={() => {
        void navigate({ to: "/post/$postId", params: { postId: post.id } });
      }}
      className={
        compact
          ? "group flex w-[220px] shrink-0 flex-col overflow-hidden rounded-card bg-well text-left outline-none transition-colors hover:bg-list-hover focus-visible:ring-2 focus-visible:ring-accent"
          : "group grid w-full grid-cols-1 overflow-hidden rounded-card bg-well text-left outline-none transition-colors hover:bg-list-hover focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[148px_minmax(0,1fr)]"
      }
      aria-label={t("storyCover.openAriaLabel", { title: post.title || t("postDetail.untitled") })}
    >
      <div
        className={
          compact
            ? `relative h-[120px] w-full overflow-hidden ${image ? "" : mesh}`
            : `relative min-h-[120px] w-full overflow-hidden sm:min-h-full ${image ? "" : mesh}`
        }
      >
        {image ? (
          <img
            src={image}
            alt={alt}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
        {post.contentWarning ? (
          <div className="absolute left-2 top-2">
            <Badge color="yellow" size="small">
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="size-3" />
                {t("storyCover.cwBadge")}
              </span>
            </Badge>
          </div>
        ) : null}
      </div>

      <div className={`flex min-w-0 flex-col gap-2 ${compact ? "p-3" : "p-4 sm:p-5"}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color={post.status === "published" ? "green" : "secondary"} size="small">
            {post.status === "published" ? t("postDetail.statusPublished") : t("postDetail.statusDraft")}
          </Badge>
          {post.tags.slice(0, compact ? 1 : 2).map((tag) => (
            <Badge key={tag} color="secondary" size="small">
              {tag}
            </Badge>
          ))}
        </div>

        <Text as="h3" variant={compact ? "strong" : "heading2"} className="text-balance">
          {post.title || t("postDetail.untitled")}
        </Text>

        {!compact ? (
          <Text as="p" color="secondary" className="line-clamp-2 text-pretty">
            {excerpt}
          </Text>
        ) : (
          <Text as="p" variant="small" color="secondary" className="line-clamp-2">
            {excerpt}
          </Text>
        )}

        <Text variant="mini" color="tertiary" className="mt-auto tabular-nums">
          {formatRelativeDate(post.updatedAt)}
        </Text>
      </div>
    </button>
  );
}
