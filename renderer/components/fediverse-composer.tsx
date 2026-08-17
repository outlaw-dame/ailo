import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Film, ImagePlus, PenLine, Quote as QuoteIcon, Search, Send, Sparkles, Users, WandSparkles, X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SegmentedControl,
  SegmentedControlItem,
  Switch,
  Text,
  Textarea,
  toast,
} from "@glaze/core/components";
import { useGlazeAI } from "@glaze/core/hooks";
import { cn } from "@glaze/core/utils";

import { api } from "../lib/api";
import type {
  AiAssistantAction,
  CustomFeedInput,
  FediPodCapabilities,
  FediverseContentType,
  FediverseObjectType,
  FediverseVisibility,
  MastodonQuotePolicy,
  MastodonMediaAttachment,
  MastodonStatus,
  KlipyGif,
} from "../lib/types";
import { MEDIA_UPLOAD_LIMITS, mediaMimeType, SUPPORTED_UPLOAD_MEDIA_TYPES } from "../lib/media-attachments";

type ComposerMode = "compose" | "assistant";
type ComposerMedia =
  | { key: string; kind: "uploaded"; attachment: MastodonMediaAttachment; description: string }
  | { key: string; kind: "local"; file: File; mimeType: string; previewUrl: string; description: string };

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: AiAssistantAction;
}

const BLOCKED_MESSAGE_KEY: Record<string, string> = {
  "needs-consent": "composer.aiBlockedNeedsConsent",
  "signed-out": "composer.aiBlockedSignedOut",
  "needs-subscription": "composer.aiBlockedNeedsSubscription",
  "insufficient-credits": "composer.aiBlockedInsufficientCredits",
  "daily-limit-reached": "composer.aiBlockedDailyLimit",
  "host-unavailable": "composer.aiBlockedHostUnavailable",
  disabled: "composer.aiBlockedDisabled",
};

// Names the draft_custom_feed capability explicitly (lib/assistant-tools.mjs
// wires the tool itself either way, and its own description already tells
// the model to call it) — a system prompt that only ever frames this as a
// post-drafting assistant biases a smaller model like the default
// gpt-4o-mini away from reaching for a tool nothing here mentioned it has,
// so this is reinforcement, not the only place the instruction lives.
const ASSISTANT_SYSTEM_PROMPT =
  "You are a warm, concise assistant for the Fediverse. Help the user draft short posts (roughly 500 "
  + "characters) to share — offer a couple of concrete phrasing options when it helps, and keep the tone "
  + "conversational otherwise. You can also draft a custom feed (a saved rule set of accounts, hashtags, "
  + "topics, and exclusions) whenever the user asks to create, build, or set one up — use the "
  + "draft_custom_feed tool for that instead of just describing what a feed would look like.";

/**
 * Chat for open-ended conversational drafting help. Uses your configured
 * FediPod provider key (OpenAI/Gemini) when one exists — the same key the
 * rest of the AI features already run on — so a configured key is what
 * actually gets used rather than a Glaze-subscription default the user never
 * asked to draw on. Falls back to Glaze's own hosted chat only when no
 * provider is configured, so the assistant still works out of the box.
 */
export function AssistantPanel({
  onUseInComposer,
  providerConfigured,
}: {
  onUseInComposer: (content: string) => void;
  providerConfigured: boolean;
}) {
  const { t } = useTranslation();
  const { streamText, state, enableInHost } = useGlazeAI();
  const queryClient = useQueryClient();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [providerLoading, setProviderLoading] = React.useState(false);
  const [savingFeedId, setSavingFeedId] = React.useState<string | null>(null);
  const [savedFeedIds, setSavedFeedIds] = React.useState<Set<string>>(new Set());
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const loading = providerConfigured ? providerLoading : state === "loading";

  const handleSaveFeedDraft = async (messageId: string, draft: CustomFeedInput) => {
    setSavingFeedId(messageId);
    try {
      await api.fedipod.saveCustomFeed(draft);
      setSavedFeedIds((prev) => new Set(prev).add(messageId));
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "custom-feeds"] });
      toast.success(t("composer.saveFeedDraftSuccess", { name: draft.name }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("composer.saveFeedDraftError"));
    } finally {
      setSavingFeedId(null);
    }
  };

  React.useEffect(() => () => abortControllerRef.current?.abort(), []);
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const history = [...messages, userMessage];
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");

    if (providerConfigured) {
      setProviderLoading(true);
      try {
        const { reply, action } = await api.ai.assistantChat(
          history.map((m) => ({ role: m.role, content: m.content })),
        );
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: reply, action: action ?? undefined } : m)),
        );
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : t("composer.aiBlockedGeneric");
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: message } : m)));
      } finally {
        setProviderLoading(false);
      }
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamText({
        model: "fast",
        system: ASSISTANT_SYSTEM_PROMPT,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        maxOutputTokens: 500,
        abortSignal: controller.signal,
        onTextDelta: (delta) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
          ),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const errorState =
        error && typeof error === "object" && "state" in error
          ? String((error as { state: unknown }).state)
          : null;
      if (errorState === "host-unavailable") {
        await enableInHost();
        return;
      }
      const message =
        (errorState && BLOCKED_MESSAGE_KEY[errorState] && t(BLOCKED_MESSAGE_KEY[errorState]))
        || t("composer.aiBlockedGeneric");
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: message } : m)),
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <Text color="tertiary" className="px-1 py-6 text-center">
          {t("composer.assistantEmpty")}
        </Text>
      ) : (
        <div className="flex flex-col gap-2.5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "flex max-w-[85%] flex-col items-start gap-1.5 rounded-card px-3 py-2",
                  m.role === "user" ? "bg-accent" : "bg-well",
                )}
              >
                <Text
                  variant="small"
                  className={cn("whitespace-pre-wrap", m.role === "user" && "text-accent-contrast")}
                >
                  {m.content || "…"}
                </Text>
                {m.role === "assistant" && m.content ? (
                  <Button
                    size="small"
                    variant="transparent"
                    className="-ml-2"
                    onClick={() => onUseInComposer(m.content)}
                  >
                    {t("composer.useInComposer")}
                  </Button>
                ) : null}
                {m.action?.type === "custom_feed_draft" ? (
                  <div className="w-full rounded-card border border-secondary bg-well/60 p-2.5">
                    <div className="flex items-center gap-1.5">
                      <WandSparkles className="size-3.5 shrink-0" />
                      <Text variant="small-strong">{m.action.draft.name}</Text>
                    </div>
                    {m.action.draft.description ? (
                      <Text variant="mini" color="tertiary" className="mt-0.5">
                        {m.action.draft.description}
                      </Text>
                    ) : null}
                    {m.action.draft.hashtags.length || m.action.draft.semanticKeywords.length ? (
                      <Text variant="mini" color="tertiary" className="mt-1">
                        {[...m.action.draft.hashtags.map((tag) => `#${tag}`), ...m.action.draft.semanticKeywords]
                          .slice(0, 6).join(" · ")}
                      </Text>
                    ) : null}
                    <Button
                      size="small"
                      variant={savedFeedIds.has(m.id) ? "transparent" : "accent"}
                      className="mt-2"
                      disabled={savingFeedId === m.id || savedFeedIds.has(m.id)}
                      onClick={() => void handleSaveFeedDraft(m.id, m.action!.draft)}
                    >
                      {savedFeedIds.has(m.id)
                        ? t("composer.saveFeedDraftSaved")
                        : savingFeedId === m.id
                          ? t("composer.saveFeedDraftSaving")
                          : t("composer.saveFeedDraft")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
      <div className="flex items-end gap-2 border-t border-separator pt-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("composer.assistantPlaceholder")}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <Button
          size="medium"
          variant="accent"
          iconOnly
          aria-label={t("composer.assistantSendAriaLabel")}
          disabled={loading || !input.trim()}
          onClick={() => void handleSend()}
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}

export function FediverseComposer({
  open,
  onOpenChange,
  replyTo,
  onCancelReply,
  quoteTarget,
  onCancelQuote,
  capabilities,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replyTo: MastodonStatus | null;
  onCancelReply: () => void;
  quoteTarget: MastodonStatus | null;
  onCancelQuote: () => void;
  capabilities: FediPodCapabilities | undefined;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<ComposerMode>("compose");
  const [text, setText] = React.useState("");
  const [cwEnabled, setCwEnabled] = React.useState(false);
  const [cw, setCw] = React.useState("");
  const [visibility, setVisibility] = React.useState<FediverseVisibility>("public");
  const [community, setCommunity] = React.useState("");
  const [objectType, setObjectType] = React.useState<FediverseObjectType>("Note");
  const [contentType, setContentType] = React.useState<FediverseContentType>("text/plain");
  const [title, setTitle] = React.useState("");
  const [quotePolicy, setQuotePolicy] = React.useState<MastodonQuotePolicy>("public");
  const [media, setMedia] = React.useState<ComposerMedia[]>([]);
  const [gifOpen, setGifOpen] = React.useState(false);
  const [gifQuery, setGifQuery] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const aiStatus = useQuery({ queryKey: ["fedipod", "ai", "status"], queryFn: api.ai.status, enabled: open });

  const articleSupported = Boolean(capabilities?.objectTypes.includes("Article"));
  const availableContentTypes = capabilities?.contentTypes ?? ["text/plain"];

  React.useEffect(() => {
    if (!open) return;
    setMode("compose");
    setText("");
    setCw("");
    setCwEnabled(false);
    setVisibility("public");
    setCommunity("");
    setObjectType("Note");
    setContentType("text/plain");
    setTitle("");
    setQuotePolicy("public");
    setMedia((current) => {
      current.forEach((item) => { if (item.kind === "local") URL.revokeObjectURL(item.previewUrl); });
      return [];
    });
    setGifOpen(false);
    setGifQuery("");
  }, [open]);

  React.useEffect(() => {
    if (!capabilities) return;
    if (!capabilities.objectTypes.includes(objectType)) setObjectType("Note");
    if (!capabilities.contentTypes.includes(contentType)) setContentType("text/plain");
    if (!capabilities.supportsCommunityTargeting) setCommunity("");
  }, [capabilities, contentType, objectType]);

  const post = useMutation({
    mutationFn: async () => {
      const prepared = [...media];
      for (let index = 0; index < prepared.length; index += 1) {
        const item = prepared[index];
        if (item.kind === "uploaded") {
          if (item.description.trim() !== (item.attachment.description || "").trim()) {
            const attachment = await api.fedipod.updateMediaDescription(item.attachment.id, item.description);
            prepared[index] = { ...item, attachment };
            setMedia([...prepared]);
          }
          continue;
        }
        const attachment = await api.fedipod.uploadMedia({ filename: item.file.name,
          mimeType: item.mimeType, data: await item.file.arrayBuffer(), description: item.description });
        URL.revokeObjectURL(item.previewUrl);
        prepared[index] = { key: item.key, kind: "uploaded", attachment, description: item.description };
        setMedia([...prepared]);
      }
      return api.fedipod.post({
        status: text.trim(),
        spoilerText: cwEnabled ? cw.trim() || t("composer.cwDefaultText") : null,
        visibility,
        inReplyToId: replyTo?.id ?? null,
        quotedStatusId: quoteTarget?.id ?? null,
        quoteApprovalPolicy: quotePolicy,
        community: replyTo || quoteTarget ? null : community.trim() || null,
        objectType: replyTo || quoteTarget ? "Note" : objectType,
        title: !replyTo && !quoteTarget && objectType === "Article" ? title.trim() : null,
        contentType: replyTo || quoteTarget ? "text/plain" : contentType,
        mediaIds: prepared.map((item) => item.kind === "uploaded" ? item.attachment.id : "").filter(Boolean),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "timeline"] });
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "notifications"] });
      toast.success(replyTo ? t("composer.replySuccess") : quoteTarget ? t("composer.quoteSuccess") : t("composer.postSuccess"));
      onCancelReply();
      onCancelQuote();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || t("composer.postError")),
  });

  const gifSearch = useMutation({
    mutationFn: (query: string) => api.fedipod.searchGifs(query),
    onError: (error: Error) => toast.error(error.message || t("composer.gifSearchError")),
  });
  const gifImport = useMutation({
    mutationFn: (gif: KlipyGif) => api.fedipod.importGif(gif.id, gif.title),
    onSuccess: (attachment) => {
      setMedia((current) => current.length >= 4 ? current : [...current, {
        key: `gif-${attachment.id}`, kind: "uploaded", attachment,
        description: attachment.description || t("composer.gifDefaultDescription"),
      }]);
      setGifOpen(false);
    },
    onError: (error: Error) => toast.error(error.message || t("composer.gifImportError")),
  });

  const removeMedia = (key: string) => setMedia((current) => current.filter((item) => {
    if (item.key !== key) return true;
    if (item.kind === "local") URL.revokeObjectURL(item.previewUrl);
    return false;
  }));

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const available = Math.max(0, 4 - media.length);
    const valid = [...files].map((file) => ({ file, mimeType: mediaMimeType(file.type, file.name) }))
      .filter((entry): entry is { file: File; mimeType: string } => {
        if (!entry.mimeType || !SUPPORTED_UPLOAD_MEDIA_TYPES.has(entry.mimeType)
          || (!entry.mimeType.startsWith("image/") && !entry.mimeType.startsWith("video/"))) {
          toast.error(t("composer.mediaUnsupportedType", { filename: entry.file.name })); return false;
        }
        const limit = entry.mimeType.startsWith("video/") ? MEDIA_UPLOAD_LIMITS.video : MEDIA_UPLOAD_LIMITS.image;
        if (!entry.file.size || entry.file.size > limit) {
          toast.error(t("composer.mediaTooLarge", { filename: entry.file.name, limit: limit / 1024 / 1024 })); return false;
        }
        return true;
      });
    const additions = valid.slice(0, available).map(({ file, mimeType }): ComposerMedia => ({
      key: `local-${crypto.randomUUID()}`, kind: "local", file,
      mimeType, previewUrl: URL.createObjectURL(file), description: "",
    }));
    if (valid.length > available) toast.error(t("composer.mediaLimitReached"));
    setMedia((current) => [...current, ...additions]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUseInComposer = (content: string) => {
    setText((current) => (current ? `${current}\n\n${content}` : content));
    setMode("compose");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{replyTo ? t("composer.titleReply") : quoteTarget ? t("composer.titleQuote") : t("composer.titleCompose")}</DialogTitle>
          <SegmentedControl
            value={mode}
            onValueChange={(v) => setMode(v as ComposerMode)}
            size="small"
            className="mt-2 self-start"
            aria-label={t("composer.composerModeAriaLabel")}
          >
            <SegmentedControlItem value="compose">
              <PenLine />
              {t("composer.tabCompose")}
            </SegmentedControlItem>
            <SegmentedControlItem value="assistant">
              <Sparkles />
              {t("composer.tabAssistant")}
            </SegmentedControlItem>
          </SegmentedControl>
        </DialogHeader>
        <DialogBody maxHeight="440px">
          {mode === "compose" ? (
            <div className="flex flex-col gap-3">
              {replyTo ? (
                <div className="flex items-center gap-2 rounded-card border border-secondary bg-well/40 px-3 py-2">
                  <Text variant="small" color="tertiary" truncate className="min-w-0 flex-1">
                    {t("composer.replyingTo", { handle: replyTo.account.acct || replyTo.account.username })}
                  </Text>
                  <Button size="small" variant="transparent" iconOnly aria-label={t("composer.cancelReplyAriaLabel")} onClick={onCancelReply}>
                    <X />
                  </Button>
                </div>
              ) : null}
              {quoteTarget ? (
                <div className="flex items-center gap-2 rounded-card border border-secondary bg-well/40 px-3 py-2">
                  <QuoteIcon className="size-4 shrink-0 text-tertiary" />
                  <Text variant="small" color="tertiary" truncate className="min-w-0 flex-1">
                    {t("composer.quotingTo", { handle: quoteTarget.account.acct || quoteTarget.account.username })}
                  </Text>
                  <Button size="small" variant="transparent" iconOnly aria-label={t("composer.cancelQuoteAriaLabel")} onClick={onCancelQuote}>
                    <X />
                  </Button>
                </div>
              ) : null}
              {!replyTo && !quoteTarget && articleSupported ? (
                <SegmentedControl
                  size="small"
                  value={objectType}
                  onValueChange={(value) => setObjectType(value as FediverseObjectType)}
                  aria-label={t("composer.publicationTypeAriaLabel")}
                >
                  <SegmentedControlItem value="Note" disabled={Boolean(community.trim())}>
                    {t("composer.typeNote")}
                  </SegmentedControlItem>
                  <SegmentedControlItem value="Article">{t("composer.typeArticle")}</SegmentedControlItem>
                </SegmentedControl>
              ) : null}
              {!replyTo && !quoteTarget && objectType === "Article" ? (
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("composer.articleTitlePlaceholder")}
                  aria-label={t("composer.articleTitleAriaLabel")}
                  maxLength={capabilities?.maxTitleCharacters ?? 300}
                />
              ) : null}
              {!replyTo && !quoteTarget && availableContentTypes.length > 1 ? (
                <SegmentedControl
                  size="small"
                  value={contentType}
                  onValueChange={(value) => setContentType(value as FediverseContentType)}
                  aria-label={t("composer.contentFormatAriaLabel")}
                >
                  {availableContentTypes.includes("text/plain") ? (
                    <SegmentedControlItem value="text/plain">{t("composer.contentPlain")}</SegmentedControlItem>
                  ) : null}
                  {availableContentTypes.includes("text/markdown") ? (
                    <SegmentedControlItem value="text/markdown">{t("composer.contentMarkdown")}</SegmentedControlItem>
                  ) : null}
                  {availableContentTypes.includes("text/x.misskeymarkdown") ? (
                    <SegmentedControlItem value="text/x.misskeymarkdown">{t("composer.contentMFM")}</SegmentedControlItem>
                  ) : null}
                </SegmentedControl>
              ) : null}
              {cwEnabled ? (
                <Input value={cw} onChange={(e) => setCw(e.target.value)} placeholder={t("composer.cwPlaceholder")} />
              ) : null}
              {!replyTo && !quoteTarget && capabilities?.supportsCommunityTargeting ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 shrink-0 text-tertiary" />
                    <Input
                      value={community}
                      onChange={(event) => {
                        setCommunity(event.target.value);
                        if (event.target.value.trim()) {
                          setVisibility("public");
                          setObjectType("Article");
                        }
                      }}
                      placeholder={t("composer.communityPlaceholder")}
                      aria-label={t("composer.communityAriaLabel")}
                    />
                  </div>
                  {community.trim() ? (
                    <Text variant="mini" color="tertiary" className="pl-6">
                      {t("composer.communityNote")}
                    </Text>
                  ) : null}
                </div>
              ) : null}
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={replyTo ? t("composer.replyPlaceholder") : t("composer.composePlaceholder")}
                size="large"
                autoFocus
              />
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,.webm,.webp,.ogv,.mkv"
                multiple className="hidden" onChange={(event) => addFiles(event.target.files)} />
              {media.length ? (
                <div className="grid grid-cols-2 gap-2" aria-label={t("composer.mediaAttachmentsAriaLabel")}>
                  {media.map((item) => {
                    const url = item.kind === "local" ? item.previewUrl : item.attachment.url;
                    const isVideo = item.kind === "local" ? item.mimeType.startsWith("video/")
                      : item.attachment.type === "video" || item.attachment.type === "gifv";
                    return <div key={item.key} className="relative flex flex-col gap-1.5 rounded-control border border-secondary p-2">
                      {isVideo ? <video src={url} className="h-28 w-full rounded object-contain bg-black" muted playsInline controls />
                        : <img src={url} alt="" className="h-28 w-full rounded object-contain bg-black" />}
                      <Input value={item.description} maxLength={1500} placeholder={t("composer.mediaDescriptionPlaceholder")}
                        aria-label={t("composer.mediaDescriptionAriaLabel")} onChange={(event) => setMedia((current) => current.map((entry) =>
                          entry.key === item.key ? { ...entry, description: event.target.value } : entry))} />
                      <Button type="button" size="small" variant="filled" iconOnly aria-label={t("composer.removeMediaAriaLabel")}
                        className="absolute right-3 top-3" onClick={() => removeMedia(item.key)}><X /></Button>
                    </div>;
                  })}
                </div>
              ) : null}
              {gifOpen ? (
                <div className="flex flex-col gap-2 rounded-control border border-secondary p-3">
                  <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (gifQuery.trim()) gifSearch.mutate(gifQuery.trim()); }}>
                    <Input value={gifQuery} onChange={(event) => setGifQuery(event.target.value)} maxLength={100}
                      placeholder={t("composer.gifSearchPlaceholder")} aria-label={t("composer.gifSearchAriaLabel")} />
                    <Button type="submit" size="small" variant="accent" disabled={!gifQuery.trim() || gifSearch.isPending}><Search />{t("composer.gifSearchButton")}</Button>
                  </form>
                  {gifSearch.data?.length ? <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
                    {gifSearch.data.map((gif) => <button key={gif.id} type="button" disabled={gifImport.isPending || media.length >= 4}
                      className="overflow-hidden rounded-control border border-secondary hover:border-primary disabled:opacity-50"
                      aria-label={t("composer.gifAddAriaLabel", { title: gif.title })} onClick={() => gifImport.mutate(gif)}>
                      <img src={gif.previewUrl} alt={gif.title} className="h-24 w-full object-cover" loading="lazy" />
                    </button>)}
                  </div> : gifSearch.isSuccess ? <Text variant="mini" color="tertiary">{t("composer.gifNone")}</Text> : null}
                  <Text variant="mini" color="tertiary">{t("composer.gifPoweredBy")}</Text>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="small" variant="filled" disabled={media.length >= 4 || post.isPending}
                  onClick={() => fileInputRef.current?.click()}><ImagePlus />{t("composer.addPhotoVideo")}</Button>
                <Button type="button" size="small" variant="filled" disabled={media.length >= 4 || post.isPending}
                  onClick={() => setGifOpen((value) => !value)}><Film />{t("composer.addGif")}</Button>
                {gifOpen && aiStatus.data && !aiStatus.data.klipyEnabled ? (
                  <Text variant="mini" color="tertiary">{t("composer.gifNeedsKey")}</Text>
                ) : null}
                {media.length ? <Text variant="mini" color="tertiary" className="self-center">{t("composer.mediaCount", { count: media.length })}</Text> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  size="small"
                  value={visibility}
                  onValueChange={(v) => setVisibility(v as FediverseVisibility)}
                  aria-label={t("composer.visibilityAriaLabel")}
                >
                  <SegmentedControlItem value="public">{t("composer.visibilityPublic")}</SegmentedControlItem>
                  <SegmentedControlItem value="unlisted" disabled={Boolean(community.trim())}>
                    {t("composer.visibilityUnlisted")}
                  </SegmentedControlItem>
                  <SegmentedControlItem value="private" disabled={Boolean(community.trim())}>
                    {t("composer.visibilityFollowers")}
                  </SegmentedControlItem>
                </SegmentedControl>
                {!replyTo ? (
                  <select
                    value={quotePolicy}
                    onChange={(event) => setQuotePolicy(event.target.value as MastodonQuotePolicy)}
                    aria-label={t("composer.quoteApprovalAriaLabel")}
                    className="rounded-control border border-secondary bg-control-subtle px-2 py-1 text-sm"
                  >
                    <option value="public">{t("composer.quotesAnyone")}</option>
                    <option value="followers">{t("composer.quotesFollowers")}</option>
                    <option value="nobody">{t("composer.quotesNobody")}</option>
                  </select>
                ) : null}
                <Label className="ml-1 gap-2">
                  <Switch checked={cwEnabled} onCheckedChange={setCwEnabled} aria-label={t("composer.cwAriaLabel")} />
                  {t("composer.cwLabel")}
                </Label>
              </div>
            </div>
          ) : (
            <AssistantPanel
              onUseInComposer={handleUseInComposer}
              providerConfigured={Boolean(aiStatus.data?.enabled)}
            />
          )}
        </DialogBody>
        {mode === "compose" ? (
          <DialogFooter>
            <Button variant="filled" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="accent"
              disabled={post.isPending || (!text.trim() && media.length === 0) || (objectType === "Article" && !title.trim())}
              onClick={() => post.mutate()}
            >
              <Send />
              {replyTo ? t("composer.titleReply") : quoteTarget ? t("composer.titleQuote") : community.trim() ? t("composer.postToCommunity") : t("composer.postButton")}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
