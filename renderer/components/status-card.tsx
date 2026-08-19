import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Ban,
  BadgeCheck,
  Bookmark,
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
import { useTranslation } from "react-i18next";
import { Badge, Button, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import { moderationFor } from "../lib/fediverse-moderation";
import { hashtagFromLink } from "../lib/hashtag-links";
import { formatRelativeDate, renderFediverseContent } from "../lib/markdown";
import type { MastodonStatus, SafeBrowsingResult } from "../lib/types";
import { MediaCarousel } from "./media-carousel";
import { supportedMediaKind } from "../lib/media-attachments";
import { canAutoTranslatePost, languageName } from "../lib/translation";
import { actionableError } from "../lib/actionable-error";
import { patchStatusInCaches } from "../lib/status-cache";

export function StatusCard({
  status,
  onReply,
  onQuote,
  ownAccountId,
  onHashtag,
  onStatusClick,
}: {
  status: MastodonStatus;
  onReply?: (status: MastodonStatus) => void;
  onQuote?: (status: MastodonStatus) => void;
  ownAccountId?: string | null;
  onHashtag?: (tag: string) => void;
  /** Called when the post body area is clicked. Defaults to navigating to the thread view. */
  onStatusClick?: ((status: MastodonStatus) => void) | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  // Clicking the post opens its thread, unless a specific handler is
  // provided (pass null to disable it entirely). Mirrors Phanpy's structure
  // (the whole card wrapped in a real <Link>, with nested interactive
  // elements stopping their own propagation instead of the card guarding
  // against them) — but drives the actual navigation through an explicit
  // onClick calling router.navigate() imperatively, rather than trusting the
  // Link's own href-based default action. TanStack Router's Link composes a
  // passed-in onClick *before* its internal handler and skips its own
  // navigation once the event is already defaultPrevented, so this replaces
  // rather than duplicates it. Belt-and-suspenders: the real <a href> still
  // gives native hover/focus/keyboard/cmd-click semantics either way, but
  // the actual navigation goes through the exact mechanism already proven
  // to work elsewhere in this app (sidebar nav, the card's own action
  // buttons) rather than whatever's different about a plain anchor click in
  // this app's WKWebView renderer.
  const isClickable = onStatusClick !== null;
  const useDefaultNavigate = onStatusClick === undefined;
  const handleLinkClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      // TEMP DIAGNOSTIC — remove once click-to-thread is confirmed working.
      // If this toast never appears on click, the event isn't reaching this
      // handler at all (something upstream of the card, not the navigation
      // mechanism itself). If it appears but the thread view doesn't open,
      // the problem is in navigate()/the route, not the click.
      toast.success("card click reached handleLinkClick");
      event.preventDefault();
      void navigate({ to: "/fediverse/status/$statusId", params: { statusId: s.id } });
    },
    [navigate, s.id],
  );
  const handleCustomClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, input, select, textarea, [role=button]")) return;
      if (typeof onStatusClick === "function") onStatusClick(s);
    },
    [onStatusClick, s],
  );
  const invalidate = () => {    void queryClient.invalidateQueries({ queryKey: ["fedipod", "timeline"] });
    void queryClient.invalidateQueries({ queryKey: ["fedipod", "notifications"] });
  };

  const favourite = useMutation({
    mutationFn: () => api.fedipod.favourite(s.id, !s.favourited),
    // Patches every cached list this status is sitting in directly, using
    // the server's own returned counts — invalidating just ["fedipod",
    // "timeline"] left every other view (a custom feed, a hashtag
    // timeline, "for you", search, a people list…) never refetching, so
    // the like looked like it silently did nothing anywhere but home.
    onSuccess: (data) => patchStatusInCaches(queryClient, s.id, {
      favourited: data.favourited, favouritesCount: data.favouritesCount,
    }),
    onError: (e: Error) => toast.error(e.message),
  });
  const boost = useMutation({
    mutationFn: () => api.fedipod.boost(s.id, !s.reblogged),
    onSuccess: (data) => patchStatusInCaches(queryClient, s.id, {
      reblogged: data.reblogged, reblogsCount: data.reblogsCount,
    }),
    onError: (e: Error) => toast.error(e.message),
  });
  const follow = useMutation({
    mutationFn: () => api.fedipod.follow(followTarget.id, true),
    onSuccess: () =>
      toast.success(
        followTarget.group
          ? t("statusCard.joinSuccess", { handle: followTarget.acct || followTarget.username })
          : t("statusCard.followSuccess", { handle: followTarget.acct || followTarget.username }),
      ),
    onError: (e: Error) => toast.error(e.message),
  });
  const mute = useMutation({
    mutationFn: () => api.fedipod.mute(s.account.id, true),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["fedipod", "mutes"] });
      toast.success(t("statusCard.muteSuccess", { handle: s.account.acct || s.account.username }));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const block = useMutation({
    mutationFn: () => api.fedipod.block(s.account.id, true),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["fedipod", "blocks"] });
      toast.success(t("statusCard.blockSuccess", { handle: s.account.acct || s.account.username }));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pin = useMutation({
    mutationFn: () => api.fedipod.pin(s.id, !s.pinned),
    onSuccess: (data) => {
      patchStatusInCaches(queryClient, s.id, { pinned: data.pinned });
      toast.success(data.pinned ? t("statusCard.pinned") : t("statusCard.unpinned"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const bookmark = useMutation({
    mutationFn: () => api.fedipod.bookmark(s.id, !s.bookmarked),
    onSuccess: (data) => {
      patchStatusInCaches(queryClient, s.id, { bookmarked: data.bookmarked });
      toast.success(data.bookmarked ? t("statusCard.bookmarked") : t("statusCard.unbookmarked"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aiStatus = useQuery({ queryKey: ["fedipod", "ai", "status"], queryFn: api.ai.status });
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
        toast.error(error instanceof Error ? error.message : t("statusCard.safeBrowsingCheckFailed"));
        return;
      }
    }
    await api.app.openExternal(url);
  }, [aiStatus.data?.safeBrowsingEnabled]);
  const handleContentClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest("a") : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    // Any real link inside the post body — a mention, a hashtag, or a plain
    // URL — must not *also* trigger the card's own navigate-to-thread click
    // once the whole card is wrapped in a <Link>. Non-hashtag links keep
    // their normal (uninterrupted) default action; only the outer card
    // navigation is what's being suppressed here.
    event.stopPropagation();
    const tag = hashtagFromLink({
      href: target.getAttribute("href"),
      dataHashtag: target.dataset.ailoHashtag,
    });
    if (tag && onHashtag) {
      event.preventDefault();
      onHashtag(tag);
    }
  }, [onHashtag]);
  const translationSettings = useQuery({
    queryKey: ["fedipod", "translation-settings"],
    queryFn: api.ai.translationSettings,
    enabled: Boolean(aiStatus.data?.translationProviders.length),
  });
  const plainContent = React.useMemo(() => {
    const document = new DOMParser().parseFromString(s.content, "text/html");
    return (document.body.textContent || s.content).trim();
  }, [s.content]);
  const [manualTranslation, setManualTranslation] = React.useState(false);
  const [autoTranslationDismissed, setAutoTranslationDismissed] = React.useState(false);
  const targetLang = translationSettings.data?.targetLanguage ?? "en";
  const autoTranslation = Boolean(translationSettings.data?.autoTranslate) && canAutoTranslatePost({
    textLength: plainContent.length,
    sourceLanguage: s.language,
    targetLanguage: targetLang,
    hasContentWarning: Boolean(s.spoilerText),
    sensitive: s.sensitive,
    hasMedia: s.mediaAttachments.length > 0,
    hasCard: Boolean(s.card),
    isArticle: s.objectType === "Article",
    hasFilterWarning: filterWarnings.length > 0,
  });
  const translationVisible = manualTranslation || (autoTranslation && !autoTranslationDismissed);
  const translation = useQuery({
    queryKey: ["fedipod", "translation", s.id, targetLang, translationSettings.data?.provider ?? "auto"],
    queryFn: () => api.ai.translate(
      plainContent,
      targetLang,
      translationSettings.data?.provider ?? aiStatus.data?.defaultTranslationProvider ?? undefined,
    ),
    enabled: translationVisible && revealed && filterRevealed && !hiddenByFilter && Boolean(plainContent),
    staleTime: Infinity,
    retry: 1,
  });

  const media = s.mediaAttachments.filter((attachment) => supportedMediaKind(attachment.type));

  if (hiddenByFilter) return null;

  const cardBodyClassName = "flex flex-col gap-2.5";
  const openThreadLabel = t("statusCard.openThread", {
    defaultValue: "Open post by {{name}}",
    name: s.account.displayName || s.account.acct || s.account.username,
  });

  const cardBody = (
    <>
      {booster ? (
        <div className="flex items-center gap-1.5 text-tertiary">
          <Repeat2 className="size-3.5 shrink-0" />
          <Text variant="mini" color="tertiary" truncate>
            {booster.group
              ? t("statusCard.sharedTo", { handle: booster.acct || booster.username })
              : t("statusCard.boostedBy", { name: booster.displayName })}
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
              {t("statusCard.communityBadge")}
            </Badge>
          ) : null}
        </div>
        {!isOwn ? (
          <Button
            size="small"
            variant="transparent"
            iconOnly
            aria-label={t(
              followTarget.group ? "statusCard.joinAriaLabel" : "statusCard.followAriaLabel",
              { name: followTarget.displayName },
            )}
            disabled={follow.isPending}
            onClick={(event) => { event.stopPropagation(); follow.mutate(); }}
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
          <Button size="small" variant="filled" onClick={(event) => { event.stopPropagation(); setRevealed((v) => !v); }}>
            {revealed ? t("statusCard.spoilerHide") : t("statusCard.spoilerShow")}
          </Button>
        </div>
      ) : null}

      {filterWarnings.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-secondary px-3 py-2">
          <ShieldAlert className="size-4 shrink-0 text-tertiary" />
          <Text variant="small" className="min-w-0 flex-1">
            {t("statusCard.filteredPrefix", {
              filterNames: [...new Set(filterWarnings.map((result) => result.filter.title))].join(", "),
            })}
          </Text>
          <Button size="small" variant="filled" onClick={(event) => { event.stopPropagation(); setFilterRevealed((value) => !value); }}>
            {filterRevealed ? t("statusCard.spoilerHide") : t("statusCard.spoilerShow")}
          </Button>
        </div>
      ) : null}

      {unsafeLink ? (
        <div className="flex flex-col gap-2 rounded-control border border-danger/40 bg-danger/5 px-3 py-2">
          <div className="flex items-start gap-2 text-danger">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <Text variant="small" color="danger">
              {t("statusCard.safeBrowsingWarning", {
                threats: unsafeLink.result.threats.flatMap((threat) => threat.threatTypes).length
                  ? t("statusCard.safeBrowsingThreats", {
                    types: unsafeLink.result.threats.flatMap((threat) => threat.threatTypes).join(", "),
                  })
                  : "",
              })}
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="small" variant="filled" onClick={(event) => { event.stopPropagation(); void api.app.openExternal(unsafeLink.url); }}>
              {t("statusCard.openAnyway")}
            </Button>
            <Button
              size="small"
              variant="transparent"
              onClick={(event) => { event.stopPropagation(); void api.app.openExternal("https://developers.google.com/safe-browsing/v4/advisory"); }}
            >
              {t("statusCard.safeBrowsingAdvisory")}
            </Button>
            <Button size="small" variant="transparent" onClick={(event) => { event.stopPropagation(); setUnsafeLink(null); }}>{t("common.dismiss")}</Button>
          </div>
        </div>
      ) : null}

      {revealed && filterRevealed ? (
        <>
          {s.objectType === "Article" ? (
            <div className="flex flex-col gap-1">
              <Badge color="blue" size="small" className="w-fit">
                {t("statusCard.articleBadge")}
              </Badge>
              {s.title ? <h2 className="text-lg font-semibold leading-tight">{s.title}</h2> : null}
            </div>
          ) : null}
          <div
            className="mfm-content text-primary text-regular leading-relaxed break-words [&_a]:underline [&_a]:decoration-tertiary [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: renderFediverseContent(s) }}
            onClick={handleContentClick}
          />
          {translationVisible ? (
            <div className="flex flex-col gap-1 rounded-control border border-dashed border-secondary px-3 py-2" aria-live="polite">
              <Text variant="mini" color="tertiary">
                {autoTranslation && !manualTranslation ? t("statusCard.autoTranslated") : t("statusCard.translated")}
                {languageName(s.language) ? t("statusCard.translatedFrom", { language: languageName(s.language) }) : ""}
                {t("statusCard.translatedTo", { language: languageName(targetLang) ?? targetLang })}
              </Text>
              {translation.isPending ? <Text variant="small" color="tertiary">{t("statusCard.translating")}</Text> : null}
              {translation.data ? <Text variant="small" className="whitespace-pre-wrap" lang={targetLang} dir="auto">
                {translation.data}
              </Text> : null}
              {translation.isError ? <div className="flex items-center gap-2">
                <Text variant="small" color="danger">{actionableError(translation.error, t("statusCard.translateError"))}</Text>
                <Button size="small" variant="transparent" onClick={(event) => { event.stopPropagation(); void translation.refetch(); }}>{t("common.retry")}</Button>
              </div> : null}
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
                  onClick={handleContentClick}
                />
              </div>
            ) : (
              <Text variant="mini" color="tertiary">{t("statusCard.quoteState", { state: s.quote.state })}</Text>
            )
          ) : null}
        </>
      ) : null}
    </>
  );

  // Media and the link-preview card render outside the clickable Link
  // entirely — not just stopPropagation'd within it — so a native <video>/
  // <audio> element is never a descendant of a real <a>, which is its own
  // source of WKWebView playback/control quirks independent of anything
  // about *whose* click reaches where. It's also the more correct UX
  // regardless: clicking media should play/expand it, not navigate away.
  const mediaAndCard = revealed && filterRevealed ? (
    <>
      <MediaCarousel attachments={media} onOpenExternal={(url) => void openExternalChecked(url)} />
      {media.length === 0 && s.card && s.card.url ? (
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
                  {t("statusCard.creditedTo", {
                    handle: s.card.authors[0]?.account
                      ? `@${s.card.authors[0].account.acct || s.card.authors[0].account.username}`
                      : s.card.authors[0]?.name,
                  })}
                </Text>
              </button>
            ) : null}
            {s.card.missingAttribution ? (
              <div className="mt-1 flex items-center gap-1.5 text-danger">
                <ShieldAlert className="size-3.5 shrink-0" />
                <Text variant="mini" color="danger">
                  {t("statusCard.missingAttribution")}
                </Text>
              </div>
            ) : null}
            {aiStatus.data?.safeBrowsingEnabled ? (
              <div className="mt-1 flex items-start gap-1.5 text-tertiary">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                <Text variant="mini" color="tertiary">
                  {t("statusCard.safeBrowsingNote")}
                </Text>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <article
      className={
        useDefaultNavigate || isClickable
          ? "rounded-card border border-secondary bg-well/30 px-4 py-3.5 flex flex-col gap-2.5 transition-colors hover:bg-well/60"
          : "rounded-card border border-secondary bg-well/30 px-4 py-3.5 flex flex-col gap-2.5"
      }
    >
      {useDefaultNavigate ? (
        <Link
          to="/fediverse/status/$statusId"
          params={{ statusId: s.id }}
          onClick={handleLinkClick}
          className={`${cardBodyClassName} cursor-pointer text-inherit no-underline rounded-control outline-none focus-visible:ring-2 focus-visible:ring-accent`}
          aria-label={openThreadLabel}
        >
          {cardBody}
        </Link>
      ) : isClickable ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={openThreadLabel}
          className={`${cardBodyClassName} cursor-pointer`}
          onClick={handleCustomClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleCustomClick(event as unknown as React.MouseEvent<HTMLElement>);
            }
          }}
        >
          {cardBody}
        </div>
      ) : (
        <div className={cardBodyClassName}>{cardBody}</div>
      )}

      {mediaAndCard}

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
            <Pin />{s.pinned ? t("statusCard.unpin") : t("statusCard.pin")}
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
        <Button
          size="small"
          variant="transparent"
          className={s.bookmarked ? "text-primary" : undefined}
          disabled={bookmark.isPending}
          aria-label={s.bookmarked ? t("statusCard.unbookmarkAriaLabel") : t("statusCard.bookmarkAriaLabel")}
          onClick={() => bookmark.mutate()}
        >
          <Bookmark />
        </Button>
        {aiStatus.data?.translationProviders.length ? (
          <Button
            size="small"
            variant="transparent"
            className={translationVisible ? "text-primary" : undefined}
            disabled={translationSettings.isPending}
            onClick={() => {
              if (translationVisible) {
                setManualTranslation(false);
                setAutoTranslationDismissed(true);
              } else {
                setAutoTranslationDismissed(false);
                setManualTranslation(true);
              }
            }}
          >
            <Languages />
            {translationVisible ? t("statusCard.hideTranslation") : t("statusCard.translate")}
          </Button>
        ) : null}
        {!isOwn ? <Button
          size="small"
          variant="transparent"
          disabled={mute.isPending}
          onClick={() => mute.mutate()}
        >
          <VolumeX />
          {t("statusCard.mute")}
        </Button> : null}
        {!isOwn ? (
          <Button
            size="small"
            variant="transparent"
            disabled={block.isPending}
            onClick={() => {
              if (window.confirm(t("statusCard.blockConfirm", { handle: s.account.acct || s.account.username }))) block.mutate();
            }}
          >
            <Ban />
            {t("statusCard.block")}
          </Button>
        ) : null}
        {s.url ? (
          <Button
            size="small"
            variant="transparent"
            iconOnly
            aria-label={t("statusCard.openInBrowser")}
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
