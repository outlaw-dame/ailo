import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Badge, Text } from "@glaze/core/components";

import {
  excerptFromBody,
  firstImageSrc,
  formatRelativeDate,
  meshIndexForId,
} from "../lib/markdown";
import type { Post } from "../lib/types";

interface StoryCoverProps {
  post: Post;
}

/**
 * Paper-style cover story — full-bleed visual + large headline.
 * Tiny-blog intimacy in the deck (short excerpt) underneath.
 */
export function StoryCover({ post }: StoryCoverProps) {
  const navigate = useNavigate();
  const image = firstImageSrc(post.body);
  const mesh = `knot-mesh-${meshIndexForId(post.id)}`;
  const deck = post.contentWarning
    ? post.contentWarning
    : excerptFromBody(post.body, 180) || "Open to read";
  const alt =
    post.altTexts.find((entry) => entry.src === image)?.alt ||
    post.title ||
    "Cover image";

  return (
    <button
      type="button"
      onClick={() => {
        void navigate({ to: "/post/$postId", params: { postId: post.id } });
      }}
      className="group relative w-full overflow-hidden rounded-card text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label={`Open story: ${post.title || "Untitled"}`}
    >
      <div className={`relative min-h-[320px] w-full ${image ? "" : mesh}`}>
        {image ? (
          <img
            src={image}
            alt={alt}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : null}

        <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--fg)_78%,transparent)] via-[color-mix(in_oklab,var(--fg)_28%,transparent)] to-transparent" />

        <div className="relative z-10 flex min-h-[320px] flex-col justify-end gap-3 p-7 sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={post.status === "published" ? "orange" : "secondary"} size="small">
              {post.status === "published" ? "Cover story" : "Draft"}
            </Badge>
            {post.contentWarning ? (
              <Badge color="yellow" size="small">
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  CW
                </span>
              </Badge>
            ) : null}
            {post.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} color="secondary" size="small">
                {tag}
              </Badge>
            ))}
          </div>

          <Text
            as="h2"
            variant="heading1"
            className="max-w-2xl text-balance text-[color-mix(in_oklab,var(--bg)_96%,white)]!"
          >
            {post.title || "Untitled"}
          </Text>

          <Text
            as="p"
            variant="large"
            className="max-w-xl text-pretty text-[color-mix(in_oklab,var(--bg)_82%,white)]!"
          >
            {deck}
          </Text>

          <Text
            variant="small"
            className="tabular-nums text-[color-mix(in_oklab,var(--bg)_70%,white)]!"
          >
            {formatRelativeDate(post.updatedAt)}
            {post.githubPath || post.solidUrl ? " · Shared" : ""}
          </Text>
        </div>
      </div>
    </button>
  );
}
