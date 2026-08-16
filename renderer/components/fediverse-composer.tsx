import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Film, ImagePlus, PenLine, Quote as QuoteIcon, Search, Send, Sparkles, Users, WandSparkles, X,
} from "lucide-react";
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

const BLOCKED_MESSAGE: Record<string, string> = {
  "needs-consent": "AI access wasn't allowed. Try asking again when you're ready.",
  "signed-out": "Sign in to Glaze to chat with the assistant.",
  "needs-subscription": "This needs an upgraded Glaze plan. Try again to see options.",
  "insufficient-credits": "You're out of Glaze AI credits for now.",
  "daily-limit-reached": "You've reached today's AI limit for this app.",
  "host-unavailable": "Glaze couldn't be reached. Try again.",
  disabled: "AI is currently unavailable for this account.",
};

const ASSISTANT_SYSTEM_PROMPT =
  "You are a warm, concise writing assistant helping the user draft short posts (roughly 500 characters) to share on the Fediverse. Offer a couple of concrete phrasing options when it helps, and keep the tone conversational otherwise.";

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
      toast.success(`Saved "${draft.name}" — find it under Custom feeds`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the feed");
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
        const message = error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
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
        (errorState && BLOCKED_MESSAGE[errorState]) || "Something went wrong. Try again.";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: message } : m)),
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <Text color="tertiary" className="px-1 py-6 text-center">
          Ask for help finding the words — a hook for a story, a reply, or just to think out loud.
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
                    Use in composer
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
                      {savedFeedIds.has(m.id) ? "Saved" : savingFeedId === m.id ? "Saving…" : "Save as custom feed"}
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
          placeholder="Ask the assistant…"
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
          aria-label="Send"
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
        spoilerText: cwEnabled ? cw.trim() || "Sensitive content" : null,
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
      toast.success(replyTo ? "Reply posted" : quoteTarget ? "Quote posted" : "Posted to the Fediverse");
      onCancelReply();
      onCancelQuote();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not post"),
  });

  const gifSearch = useMutation({
    mutationFn: (query: string) => api.fedipod.searchGifs(query),
    onError: (error: Error) => toast.error(error.message || "Could not search GIFs"),
  });
  const gifImport = useMutation({
    mutationFn: (gif: KlipyGif) => api.fedipod.importGif(gif.id, gif.title),
    onSuccess: (attachment) => {
      setMedia((current) => current.length >= 4 ? current : [...current, {
        key: `gif-${attachment.id}`, kind: "uploaded", attachment,
        description: attachment.description || "GIF",
      }]);
      setGifOpen(false);
    },
    onError: (error: Error) => toast.error(error.message || "Could not import GIF"),
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
          toast.error(`${entry.file.name}: unsupported media type`); return false;
        }
        const limit = entry.mimeType.startsWith("video/") ? MEDIA_UPLOAD_LIMITS.video : MEDIA_UPLOAD_LIMITS.image;
        if (!entry.file.size || entry.file.size > limit) {
          toast.error(`${entry.file.name}: media must be at most ${limit / 1024 / 1024} MB`); return false;
        }
        return true;
      });
    const additions = valid.slice(0, available).map(({ file, mimeType }): ComposerMedia => ({
      key: `local-${crypto.randomUUID()}`, kind: "local", file,
      mimeType, previewUrl: URL.createObjectURL(file), description: "",
    }));
    if (valid.length > available) toast.error("A post can contain at most 4 media attachments");
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
          <DialogTitle>{replyTo ? "Reply" : quoteTarget ? "Quote" : "Compose"}</DialogTitle>
          <SegmentedControl
            value={mode}
            onValueChange={(v) => setMode(v as ComposerMode)}
            size="small"
            className="mt-2 self-start"
            aria-label="Composer mode"
          >
            <SegmentedControlItem value="compose">
              <PenLine />
              Compose
            </SegmentedControlItem>
            <SegmentedControlItem value="assistant">
              <Sparkles />
              Assistant
            </SegmentedControlItem>
          </SegmentedControl>
        </DialogHeader>
        <DialogBody maxHeight="440px">
          {mode === "compose" ? (
            <div className="flex flex-col gap-3">
              {replyTo ? (
                <div className="flex items-center gap-2 rounded-card border border-secondary bg-well/40 px-3 py-2">
                  <Text variant="small" color="tertiary" truncate className="min-w-0 flex-1">
                    Replying to @{replyTo.account.acct || replyTo.account.username}
                  </Text>
                  <Button size="small" variant="transparent" iconOnly aria-label="Cancel reply" onClick={onCancelReply}>
                    <X />
                  </Button>
                </div>
              ) : null}
              {quoteTarget ? (
                <div className="flex items-center gap-2 rounded-card border border-secondary bg-well/40 px-3 py-2">
                  <QuoteIcon className="size-4 shrink-0 text-tertiary" />
                  <Text variant="small" color="tertiary" truncate className="min-w-0 flex-1">
                    Quoting @{quoteTarget.account.acct || quoteTarget.account.username}
                  </Text>
                  <Button size="small" variant="transparent" iconOnly aria-label="Cancel quote" onClick={onCancelQuote}>
                    <X />
                  </Button>
                </div>
              ) : null}
              {!replyTo && !quoteTarget && articleSupported ? (
                <SegmentedControl
                  size="small"
                  value={objectType}
                  onValueChange={(value) => setObjectType(value as FediverseObjectType)}
                  aria-label="Publication type"
                >
                  <SegmentedControlItem value="Note" disabled={Boolean(community.trim())}>
                    Note
                  </SegmentedControlItem>
                  <SegmentedControlItem value="Article">Article</SegmentedControlItem>
                </SegmentedControl>
              ) : null}
              {!replyTo && !quoteTarget && objectType === "Article" ? (
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Article title"
                  aria-label="Article title"
                  maxLength={capabilities?.maxTitleCharacters ?? 300}
                />
              ) : null}
              {!replyTo && !quoteTarget && availableContentTypes.length > 1 ? (
                <SegmentedControl
                  size="small"
                  value={contentType}
                  onValueChange={(value) => setContentType(value as FediverseContentType)}
                  aria-label="Content format"
                >
                  {availableContentTypes.includes("text/plain") ? (
                    <SegmentedControlItem value="text/plain">Plain</SegmentedControlItem>
                  ) : null}
                  {availableContentTypes.includes("text/markdown") ? (
                    <SegmentedControlItem value="text/markdown">Markdown</SegmentedControlItem>
                  ) : null}
                  {availableContentTypes.includes("text/x.misskeymarkdown") ? (
                    <SegmentedControlItem value="text/x.misskeymarkdown">MFM</SegmentedControlItem>
                  ) : null}
                </SegmentedControl>
              ) : null}
              {cwEnabled ? (
                <Input value={cw} onChange={(e) => setCw(e.target.value)} placeholder="Content warning" />
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
                      placeholder="Optional community, e.g. !technology@lemmy.world"
                      aria-label="Community handle"
                    />
                  </div>
                  {community.trim() ? (
                    <Text variant="mini" color="tertiary" className="pl-6">
                      Ailo verifies this is a Group. FediPod publishes the Article with the community
                      as its ActivityPub audience and delivers it publicly to the Group inbox.
                    </Text>
                  ) : null}
                </div>
              ) : null}
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={replyTo ? "Write your reply…" : "Share something with the Fediverse…"}
                size="large"
                autoFocus
              />
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,.webm,.webp,.ogv,.mkv"
                multiple className="hidden" onChange={(event) => addFiles(event.target.files)} />
              {media.length ? (
                <div className="grid grid-cols-2 gap-2" aria-label="Media attachments">
                  {media.map((item) => {
                    const url = item.kind === "local" ? item.previewUrl : item.attachment.url;
                    const isVideo = item.kind === "local" ? item.mimeType.startsWith("video/")
                      : item.attachment.type === "video" || item.attachment.type === "gifv";
                    return <div key={item.key} className="relative flex flex-col gap-1.5 rounded-control border border-secondary p-2">
                      {isVideo ? <video src={url} className="h-28 w-full rounded object-contain bg-black" muted playsInline controls />
                        : <img src={url} alt="" className="h-28 w-full rounded object-contain bg-black" />}
                      <Input value={item.description} maxLength={1500} placeholder="Describe this media for accessibility"
                        aria-label="Media description" onChange={(event) => setMedia((current) => current.map((entry) =>
                          entry.key === item.key ? { ...entry, description: event.target.value } : entry))} />
                      <Button type="button" size="small" variant="filled" iconOnly aria-label="Remove media"
                        className="absolute right-3 top-3" onClick={() => removeMedia(item.key)}><X /></Button>
                    </div>;
                  })}
                </div>
              ) : null}
              {gifOpen ? (
                <div className="flex flex-col gap-2 rounded-control border border-secondary p-3">
                  <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (gifQuery.trim()) gifSearch.mutate(gifQuery.trim()); }}>
                    <Input value={gifQuery} onChange={(event) => setGifQuery(event.target.value)} maxLength={100}
                      placeholder="Search KLIPY" aria-label="Search KLIPY GIFs" />
                    <Button type="submit" size="small" variant="accent" disabled={!gifQuery.trim() || gifSearch.isPending}><Search />Search</Button>
                  </form>
                  {gifSearch.data?.length ? <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
                    {gifSearch.data.map((gif) => <button key={gif.id} type="button" disabled={gifImport.isPending || media.length >= 4}
                      className="overflow-hidden rounded-control border border-secondary hover:border-primary disabled:opacity-50"
                      aria-label={`Add GIF: ${gif.title}`} onClick={() => gifImport.mutate(gif)}>
                      <img src={gif.previewUrl} alt={gif.title} className="h-24 w-full object-cover" loading="lazy" />
                    </button>)}
                  </div> : gifSearch.isSuccess ? <Text variant="mini" color="tertiary">No GIFs found.</Text> : null}
                  <Text variant="mini" color="tertiary">GIF search powered by KLIPY.</Text>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="small" variant="filled" disabled={media.length >= 4 || post.isPending}
                  onClick={() => fileInputRef.current?.click()}><ImagePlus />Photo or video</Button>
                <Button type="button" size="small" variant="filled" disabled={media.length >= 4 || post.isPending}
                  onClick={() => setGifOpen((value) => !value)}><Film />GIF</Button>
                {gifOpen && aiStatus.data && !aiStatus.data.klipyEnabled ? (
                  <Text variant="mini" color="tertiary">Add a KLIPY API key in Settings → Provider Keys.</Text>
                ) : null}
                {media.length ? <Text variant="mini" color="tertiary" className="self-center">{media.length} / 4 attachments</Text> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  size="small"
                  value={visibility}
                  onValueChange={(v) => setVisibility(v as FediverseVisibility)}
                  aria-label="Visibility"
                >
                  <SegmentedControlItem value="public">Public</SegmentedControlItem>
                  <SegmentedControlItem value="unlisted" disabled={Boolean(community.trim())}>
                    Unlisted
                  </SegmentedControlItem>
                  <SegmentedControlItem value="private" disabled={Boolean(community.trim())}>
                    Followers
                  </SegmentedControlItem>
                </SegmentedControl>
                {!replyTo ? (
                  <select
                    value={quotePolicy}
                    onChange={(event) => setQuotePolicy(event.target.value as MastodonQuotePolicy)}
                    aria-label="Who may quote this post"
                    className="rounded-control border border-secondary bg-control-subtle px-2 py-1 text-sm"
                  >
                    <option value="public">Quotes: anyone</option>
                    <option value="followers">Quotes: followers</option>
                    <option value="nobody">Quotes: nobody</option>
                  </select>
                ) : null}
                <Label className="ml-1 gap-2">
                  <Switch checked={cwEnabled} onCheckedChange={setCwEnabled} aria-label="Content warning" />
                  CW
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
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={post.isPending || (!text.trim() && media.length === 0) || (objectType === "Article" && !title.trim())}
              onClick={() => post.mutate()}
            >
              <Send />
              {replyTo ? "Reply" : quoteTarget ? "Quote" : community.trim() ? "Post to community" : "Post"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
