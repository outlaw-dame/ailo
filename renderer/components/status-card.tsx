import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Heart, Repeat2, Reply, ShieldAlert, UserPlus } from "lucide-react";
import { Button, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import { formatRelativeDate, sanitizeHtml } from "../lib/markdown";
import type { MastodonStatus } from "../lib/types";

export function StatusCard({
  status,
  onReply,
}: {
  status: MastodonStatus;
  onReply?: (status: MastodonStatus) => void;
}) {
  const queryClient = useQueryClient();
  const booster = status.reblog ? status.account : null;
  const s = status.reblog ?? status;
  const [revealed, setRevealed] = React.useState(!s.spoilerText);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["fedipod", "timeline"] });
    void queryClient.invalidateQueries({ queryKey: ["fedipod", "notifications"] });
  };

  const favourite = useMutation({
    mutationFn: () => api.fedipod.favourite(s.id, !s.favourited),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const boost = useMutation({
    mutationFn: () => api.fedipod.boost(s.id, !s.reblogged),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const follow = useMutation({
    mutationFn: () => api.fedipod.follow(s.account.id, true),
    onSuccess: () => toast.success(`Following @${s.account.acct || s.account.username}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const images = s.mediaAttachments.filter((m) => m.type === "image" || m.type === "gifv");

  return (
    <article className="rounded-card border border-secondary bg-well/30 px-4 py-3.5 flex flex-col gap-2.5">
      {booster ? (
        <div className="flex items-center gap-1.5 text-tertiary">
          <Repeat2 className="size-3.5 shrink-0" />
          <Text variant="mini" color="tertiary" truncate>
            {booster.displayName} boosted
          </Text>
        </div>
      ) : null}

      <div className="flex items-start gap-3 min-w-0">
        <img
          src={s.account.avatar}
          alt=""
          className="size-9 rounded-full shrink-0 bg-control-subtle object-cover"
        />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <Text variant="strong" truncate className="min-w-0">
              {s.account.displayName}
            </Text>
            <Text variant="mini" color="tertiary" className="tabular-nums shrink-0">
              {formatRelativeDate(s.createdAt)}
            </Text>
          </div>
          <Text variant="small" color="tertiary" truncate className="min-w-0">
            @{s.account.acct || s.account.username}
          </Text>
        </div>
        <Button
          size="small"
          variant="transparent"
          iconOnly
          aria-label={`Follow ${s.account.displayName}`}
          disabled={follow.isPending}
          onClick={() => follow.mutate()}
        >
          <UserPlus />
        </Button>
      </div>

      {s.spoilerText ? (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-secondary px-3 py-2">
          <ShieldAlert className="size-4 shrink-0 text-tertiary" />
          <Text variant="small" className="min-w-0 flex-1">
            {s.spoilerText}
          </Text>
          <Button size="small" variant="filled" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Hide" : "Show"}
          </Button>
        </div>
      ) : null}

      {revealed ? (
        <>
          <div
            className="text-primary text-regular leading-relaxed break-words [&_a]:underline [&_a]:decoration-tertiary [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(s.content) }}
          />
          {images.length > 0 ? (
            <div className={`grid gap-2 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {images.map((m) => (
                <img
                  key={m.id}
                  src={m.previewUrl ?? m.url}
                  alt={m.description ?? ""}
                  title={m.description ?? undefined}
                  className="w-full max-h-72 rounded-control border border-secondary object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex items-center gap-1 -ml-1.5 text-tertiary">
        <Button size="small" variant="transparent" onClick={() => onReply?.(s)}>
          <Reply />
          <span className="tabular-nums">{s.repliesCount || ""}</span>
        </Button>
        <Button
          size="small"
          variant="transparent"
          className={s.reblogged ? "text-primary" : undefined}
          disabled={boost.isPending}
          onClick={() => boost.mutate()}
        >
          <Repeat2 />
          <span className="tabular-nums">{s.reblogsCount || ""}</span>
        </Button>
        <Button
          size="small"
          variant="transparent"
          className={s.favourited ? "text-primary" : undefined}
          disabled={favourite.isPending}
          onClick={() => favourite.mutate()}
        >
          <Heart />
          <span className="tabular-nums">{s.favouritesCount || ""}</span>
        </Button>
        {s.url ? (
          <Button
            size="small"
            variant="transparent"
            iconOnly
            aria-label="Open in browser"
            className="ml-auto"
            onClick={() => {
              if (s.url) void api.app.openExternal(s.url);
            }}
          >
            <ExternalLink />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
