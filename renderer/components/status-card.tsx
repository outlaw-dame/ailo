import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  BadgeCheck,
  ExternalLink,
  Heart,
  Languages,
  Pin,
  Quote,
  Repeat2,
  Reply,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  VolumeX,
} from "lucide-react";
import { Badge, Button, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import { moderationFor } from "../lib/fediverse-moderation";
import { formatRelativeDate, renderFediverseContent } from "../lib/markdown";
import type { MastodonStatus, SafeBrowsingResult } from "../lib/types";
import { useAiProvider } from "./ai-provider-control";

export function StatusCard({
  status,
  onReply,
  onQuote,
  ownAccountId,
}: {
  status: MastodonStatus;
  onReply?: (status: MastodonStatus) => void;
  onQuote?: (status: MastodonStatus) => void;
  ownAccountId?: string | null;
}) {
  const queryClient = useQueryClient();
  const booster = status.reblog ? status.account : null;
  const s = status.reblog ?? status;
  const followTarget = booster?.group ? booster : s.account;
  const isOwn = Boolean(ownAccountId && s.account.id === ownAccountId);
  const [revealed, setRevealed] = React.useState(!s.spoilerText);
  const filterModeration = moderationFor(s.filtered);
  const hiddenByFilter = filterModeration.hidden;
  const filterWarnings = filterModeration.warnings;
  const [filterRevealed, setFilterRevealed] = React.useState(filterWarnings.length === 0);
  const filterKey = filterWarnings.map((result) => result.filter.id).join(",");
  React.useEffect(() => setFilterRevealed(!filterKey), [filterKey]);

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
    mutationFn: () => api.fedipod.follow(followTarget.id, true),
    onSuccess: () =>
      toast.success(
        followTarget.group
          ? `Joined !${followTarget.acct || followTarget.username}`
          : `Following @${followTarget.acct || followTarget.username}`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });
  const mute = useMutation({
    mutationFn: () => api.fedipod.mute(s.account.id, true),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["fedipod", "mutes"] });
      toast.success(`Muted @${s.account.acct || s.account.username}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const block = useMutation({
    mutationFn: () => api.fedipod.block(s.account.id, true),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["fedipod", "blocks"] });
      toast.success(`Blocked @${s.account.acct || s.account.username}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pin = useMutation({
    mutationFn: () => api.fedipod.pin(s.id, !s.pinned),
    onSuccess: () => { invalidate(); toast.success(s.pinned ? "Post unpinned" : "Post pinned"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const aiStatus = useQuery({ queryKey: ["fedipod", "ai", "status"], queryFn: api.ai.status });
  const [aiProvider] = useAiProvider(aiStatus.data);
  const [unsafeLink, setUnsafeLink] = React.useState<{
    url: string;
    result: SafeBrowsingResult;
  } | null>(null);
  const openExternalChecked = React.useCallback(async (url: string) => {
    if (aiStatus.data?.safeBrowsingEnabled) {
      try {
        const result = await api.safety.checkUrls([url]);
        if (!result.safe) {
          setUnsafeLink({ url, result });
          return;
        }
        setUnsafeLink(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Safe Browsing check failed");
        return;
      }
    }
    await api.app.openExternal(url);
  }, [aiStatus.data?.safeBrowsingEnabled]);
  const [translated, setTranslated] = React.useState<string | null>(null);
  const targetLang = typeof navigator !== "undefined" ? navigator.language.split("-")[0] : "en";
  const translate = useMutation({
    mutationFn: () => api.ai.translate(s.content, targetLang, aiProvider ?? undefined),
    onSuccess: setTranslated,
    onError: (e: Error) => toast.error(e.message || "Could not translate"),
  });

  const images = s.mediaAttachments.filter((m) => m.type === "image" || m.type === "gifv");

  if (hiddenByFilter) return null;

  return (
    <article className="rounded-card border border-secondary bg-well/30 px-4 py-3.5 flex flex-col gap-2.5">
      {booster ? (
        <div className="flex items-center gap-1.5 text-tertiary">
          <Repeat2 className="size-3.5 shrink-0" />
          <Text variant="mini" color="tertiary" truncate>
            {booster.group
              ? `Shared to !${booster.acct || booster.username}`
              : `${booster.displayName} boosted`}
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
            {s.account.group ? "!" : "@"}
            {s.account.acct || s.account.username}
          </Text>
          {s.account.group ? (
            <Badge color="blue" size="small" className="mt-1 w-fit">
              Community
            </Badge>
          ) : null}
        </div>
        {!isOwn ? (
          <Button
            size="small"
            variant="transparent"
            iconOnly
            aria-label={`${followTarget.group ? "Join" : "Follow"} ${followTarget.displayName}`}
            disabled={follow.isPending}
            onClick={() => follow.mutate()}
          >
            <UserPlus />
          </Button>
        ) : null}
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

      {filterWarnings.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-secondary px-3 py-2">
          <ShieldAlert className="size-4 shrink-0 text-tertiary" />
          <Text variant="small" className="min-w-0 flex-1">
            Filtered: {[...new Set(filterWarnings.map((result) => result.filter.title))].join(", ")}
          </Text>
          <Button size="small" variant="filled" onClick={() => setFilterRevealed((value) => !value)}>
            {filterRevealed ? "Hide" : "Show"}
          </Button>
        </div>
      ) : null}

      {unsafeLink ? (
        <div className="flex flex-col gap-2 rounded-control border border-danger/40 bg-danger/5 px-3 py-2">
          <div className="flex items-start gap-2 text-danger">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <Text variant="small" color="danger">
              Google identified this address as potentially risky
              {unsafeLink.result.threats.flatMap((threat) => threat.threatTypes).length
                ? ` (${unsafeLink.result.threats.flatMap((threat) => threat.threatTypes).join(", ")})`
                : ""}. Results may be incomplete or mistaken.
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="small" variant="filled" onClick={() => void api.app.openExternal(unsafeLink.url)}>
              Open anyway
            </Button>
            <Button
              size="small"
              variant="transparent"
              onClick={() => void api.app.openExternal("https://developers.google.com/safe-browsing/v4/advisory")}
            >
              Advisory provided by Google
            </Button>
            <Button size="small" variant="transparent" onClick={() => setUnsafeLink(null)}>Dismiss</Button>
          </div>
        </div>
      ) : null}

      {revealed && filterRevealed ? (
        <>
          {s.objectType === "Article" ? (
            <div className="flex flex-col gap-1">
              <Badge color="blue" size="small" className="w-fit">
                Article
              </Badge>
              {s.title ? <h2 className="text-lg font-semibold leading-tight">{s.title}</h2> : null}
            </div>
          ) : null}
          <div
            className="mfm-content text-primary text-regular leading-relaxed break-words [&_a]:underline [&_a]:decoration-tertiary [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: renderFediverseContent(s) }}
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
          {images.length === 0 && s.card && s.card.url ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (s.card) void openExternalChecked(s.card.url);
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && s.card) {
                  event.preventDefault();
                  void openExternalChecked(s.card.url);
                }
              }}
              className="flex cursor-pointer flex-col gap-2 overflow-hidden rounded-control border border-secondary text-left transition-colors hover:bg-control-subtle/60"
            >
              {s.card.image ? (
                <img
                  src={s.card.image}
                  alt=""
                  className="max-h-48 w-full object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="flex flex-col gap-1 px-3 py-2.5">
                <Text variant="small-strong" truncate>
                  {s.card.title || s.card.url}
                </Text>
                {s.card.description ? (
                  <Text variant="mini" color="tertiary" className="line-clamp-2">
                    {s.card.description}
                  </Text>
                ) : null}
                {s.card.providerName ? (
                  <Text variant="mini" color="quaternary" truncate>{s.card.providerName}</Text>
                ) : null}
                {s.card.authors.length > 0 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      const target = s.card?.authors[0]?.account?.url || s.card?.authors[0]?.url;
                      if (target) void openExternalChecked(target);
                    }}
                    className="mt-1 flex w-fit items-center gap-1.5 text-tertiary hover:text-primary"
                  >
                    <BadgeCheck className="size-3.5 shrink-0" />
                    <Text variant="mini" color="tertiary" truncate>
                      Credited to{" "}
                      {s.card.authors[0]?.account
                        ? `@${s.card.authors[0].account.acct || s.card.authors[0].account.username}`
                        : s.card.authors[0]?.name}
                    </Text>
                  </button>
                ) : null}
                {s.card.missingAttribution ? (
                  <div className="mt-1 flex items-center gap-1.5 text-danger">
                    <ShieldAlert className="size-3.5 shrink-0" />
                    <Text variant="mini" color="danger">
                      This page names you as creator, but its domain is not in your allowed websites.
                    </Text>
                  </div>
                ) : null}
                {aiStatus.data?.safeBrowsingEnabled ? (
                  <div className="mt-1 flex items-start gap-1.5 text-tertiary">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                    <Text variant="mini" color="tertiary">
                      Checked with Google Safe Browsing when opened; some risky sites may be missed and safe sites may be identified in error
                    </Text>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {translated ? (
            <div className="flex flex-col gap-1 rounded-control border border-dashed border-secondary px-3 py-2">
              <Text variant="mini" color="tertiary">Translated ({targetLang})</Text>
              <Text variant="small" className="whitespace-pre-wrap">{translated}</Text>
            </div>
          ) : null}
          {s.quote ? (
            s.quote.quotedStatus ? (
              <div className="flex flex-col gap-1.5 rounded-control border border-secondary bg-control-subtle/50 px-3 py-2.5">
                <Text variant="small-strong" truncate>
                  {s.quote.quotedStatus.account.displayName} · @{s.quote.quotedStatus.account.acct || s.quote.quotedStatus.account.username}
                </Text>
                <div
                  className="text-sm leading-relaxed break-words [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: renderFediverseContent(s.quote.quotedStatus) }}
                />
              </div>
            ) : (
              <Text variant="mini" color="tertiary">Quote {s.quote.state}</Text>
            )
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 -ml-1.5 text-tertiary">
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
          disabled={!onQuote || s.quoteApproval?.currentUser === "denied"}
          onClick={() => onQuote?.(s)}
        >
          <Quote />
          <span className="tabular-nums">{s.quotesCount || ""}</span>
        </Button>
        {isOwn ? (
          <Button size="small" variant="transparent" className={s.pinned ? "text-primary" : undefined}
            disabled={pin.isPending} onClick={() => pin.mutate()}>
            <Pin />{s.pinned ? "Unpin" : "Pin"}
          </Button>
        ) : null}
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
        {aiStatus.data?.enabled ? (
          <Button
            size="small"
            variant="transparent"
            className={translated ? "text-primary" : undefined}
            disabled={translate.isPending}
            onClick={() => (translated ? setTranslated(null) : translate.mutate())}
          >
            <Languages />
            {translated ? "Original" : "Translate"}
          </Button>
        ) : null}
        {!isOwn ? <Button
          size="small"
          variant="transparent"
          disabled={mute.isPending}
          onClick={() => mute.mutate()}
        >
          <VolumeX />
          Mute
        </Button> : null}
        {!isOwn ? (
          <Button
            size="small"
            variant="transparent"
            disabled={block.isPending}
            onClick={() => {
              if (window.confirm(`Block @${s.account.acct || s.account.username}?`)) block.mutate();
            }}
          >
            <Ban />
            Block
          </Button>
        ) : null}
        {s.url ? (
          <Button
            size="small"
            variant="transparent"
            iconOnly
            aria-label="Open in browser"
            className="ml-auto"
            onClick={() => {
              if (s.url) void openExternalChecked(s.url);
            }}
          >
            <ExternalLink />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
