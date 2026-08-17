import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Eye, ImagePlus, Plus, Save, Send, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Field,
  FieldGroup,
  Input,
  ScrollArea,
  SegmentedControl,
  SegmentedControlItem,
  Switch,
  Text,
  Textarea,
  toast,
  ToolbarBackButton,
} from "@glaze/core/components";

import { MarkdownPreview } from "../components/markdown-preview";
import { AiProviderControl, useAiProvider } from "../components/ai-provider-control";
import { api } from "../lib/api";
import { extractImageSources } from "../lib/markdown";
import type { ImageAltText, Post } from "../lib/types";

type EditorMode = "write" | "preview";

function mergeAltTexts(body: string, existing: ImageAltText[]): ImageAltText[] {
  const sources = extractImageSources(body);
  return sources.map((src) => ({
    src,
    alt: existing.find((entry) => entry.src === src)?.alt ?? "",
  }));
}

export function EditorView() {
  const { t } = useTranslation();
  const params = useParams({ strict: false }) as { postId?: string };
  const postId = params.postId;
  const isEditing = Boolean(postId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existingQuery = useQuery({
    queryKey: ["posts", postId],
    queryFn: () => api.posts.get(postId!),
    enabled: Boolean(postId),
  });

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [contentWarningEnabled, setContentWarningEnabled] = React.useState(false);
  const [contentWarning, setContentWarning] = React.useState("");
  const [altTexts, setAltTexts] = React.useState<ImageAltText[]>([]);
  const [tagsInput, setTagsInput] = React.useState("");
  const [mode, setMode] = React.useState<EditorMode>("write");
  const [hydratedId, setHydratedId] = React.useState<string | null>(null);
  const [manualAltSrc, setManualAltSrc] = React.useState("");
  const [suggestedTags, setSuggestedTags] = React.useState<string[]>([]);

  const aiStatus = useQuery({ queryKey: ["fedipod", "ai", "status"], queryFn: api.ai.status });
  const [aiProvider, setAiProvider] = useAiProvider(aiStatus.data);
  const suggestHashtags = useMutation({
    mutationFn: () => api.ai.suggestHashtags(`${title}\n\n${body}`, aiProvider ?? undefined),
    onSuccess: (hashtags) => setSuggestedTags(hashtags),
    onError: (error: Error) => toast.error(error.message || t("editor.hashtagError")),
  });
  const currentTags = new Set(tagsInput.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const addSuggestedTag = (tag: string) => {
    setTagsInput((prev) => (prev.trim() ? `${prev.trim()}, ${tag}` : tag));
    setSuggestedTags((prev) => prev.filter((entry) => entry !== tag));
  };

  React.useEffect(() => {
    if (!postId) {
      setTitle("");
      setBody(t("editor.defaultBody"));
      setContentWarningEnabled(false);
      setContentWarning("");
      setAltTexts([]);
      setTagsInput(t("editor.defaultTags"));
      setHydratedId(null);
      return;
    }
    const post = existingQuery.data;
    if (!post || hydratedId === post.id) return;
    setTitle(post.title);
    setBody(post.body);
    setContentWarningEnabled(Boolean(post.contentWarning));
    setContentWarning(post.contentWarning ?? "");
    setAltTexts(post.altTexts);
    setTagsInput(post.tags.join(", "));
    setHydratedId(post.id);
  }, [postId, existingQuery.data, hydratedId, t]);

  React.useEffect(() => {
    setAltTexts((current) => mergeAltTexts(body, current));
  }, [body]);

  const tags = tagsInput
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "published") => {
      const payload = {
        title: title.trim() || t("postDetail.untitled"),
        body,
        contentWarning: contentWarningEnabled ? contentWarning.trim() || t("composer.cwDefaultText") : null,
        altTexts,
        tags,
        status: status === "draft" ? ("draft" as const) : undefined,
      };

      let post: Post;
      if (isEditing && postId) {
        post = await api.posts.update(postId, {
          ...payload,
          status: status === "draft" ? "draft" : undefined,
        });
      } else {
        post = await api.posts.create({
          ...payload,
          status: "draft",
        });
      }

      if (status === "published") {
        const published = await api.publish.post(post.id);
        return published;
      }
      return { post, results: {} as const };
    },
    onSuccess: async (result, status) => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      if (status === "published") {
        const bits: string[] = [t("editor.publishedLocally")];
        if (result.results && "solid" in result.results && result.results.solid) {
          bits.push(result.results.solid.ok ? t("editor.solidSuccess") : t("editor.solidFailed"));
        }
        if (result.results && "github" in result.results && result.results.github) {
          bits.push(result.results.github.ok ? t("editor.githubSuccess") : t("editor.githubFailed"));
        }
        if (result.results && "fediverse" in result.results && result.results.fediverse) {
          bits.push(result.results.fediverse.ok ? t("editor.fediverseSuccess") : t("editor.fediverseFailed"));
        }
        toast.success(bits.join(" · "));
        if (
          result.results &&
          "solid" in result.results &&
          result.results.solid &&
          !result.results.solid.ok
        ) {
          toast.error(result.results.solid.error);
        }
        if (
          result.results &&
          "github" in result.results &&
          result.results.github &&
          !result.results.github.ok
        ) {
          toast.error(result.results.github.error);
        }
        if (
          result.results &&
          "fediverse" in result.results &&
          result.results.fediverse &&
          !result.results.fediverse.ok
        ) {
          toast.error(result.results.fediverse.error);
        }
      } else {
        toast.success(t("editor.draftSaved"));
      }
      void navigate({ to: "/post/$postId", params: { postId: result.post.id } });
    },
    onError: (error: Error) => {
      toast.error(error.message || t("editor.saveError"));
    },
  });

  const busy = saveMutation.isPending;

  return (
    <ScrollArea
      title={isEditing ? t("editor.titleEdit") : t("editor.titleNew")}
      subtitle={t("editor.subtitle")}
      leading={
        <ToolbarBackButton
          onClick={() => {
            void navigate({
              to: isEditing && postId ? "/post/$postId" : "/",
              params: postId ? { postId } : undefined,
            });
          }}
        />
      }
      actions={
        <div className="flex items-center gap-1.5">
          <SegmentedControl
            size="small"
            value={mode}
            onValueChange={(value) => setMode(value as EditorMode)}
            aria-label={t("editor.editorModeAriaLabel")}
          >
            <SegmentedControlItem value="write">{t("editor.tabWrite")}</SegmentedControlItem>
            <SegmentedControlItem value="preview">
              <Eye />
              {t("editor.tabPreview")}
            </SegmentedControlItem>
          </SegmentedControl>
          <Button
            size="small"
            variant="filled"
            disabled={busy}
            onClick={() => saveMutation.mutate("draft")}
          >
            <Save />
            {t("editor.saveDraft")}
          </Button>
          <Button
            size="small"
            variant="accent"
            disabled={busy}
            onClick={() => saveMutation.mutate("published")}
          >
            <Send />
            {t("editor.publish")}
          </Button>
        </div>
      }
      className="h-full"
    >
      <div className="px-8 py-6 max-w-3xl flex flex-col gap-5">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("editor.titlePlaceholder")}
          size="large"
          className="text-heading2! font-normal! h-auto! py-2!"
          aria-label={t("editor.titlePlaceholder")}
        />

        {mode === "write" ? (
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("editor.bodyPlaceholder")}
            aria-label={t("editor.bodyAriaLabel")}
            spellCheck
            className="w-full min-h-[320px] max-h-[60vh] resize-y rounded-control border border-field bg-transparent px-3 py-3 text-regular leading-relaxed text-primary outline-none focus:border-foreground-40 placeholder:text-quaternary"
          />
        ) : (
          <div className="min-h-[320px] rounded-control border border-secondary bg-well/40 px-5 py-4">
            {body.trim() ? (
              <MarkdownPreview body={body} altTexts={altTexts} />
            ) : (
              <Text color="tertiary">{t("editor.previewEmpty")}</Text>
            )}
          </div>
        )}

        <FieldGroup>
          <Field
            label={t("editor.contentWarningLabel")}
            description={t("editor.contentWarningDescription")}
            orientation="horizontal"
          >
            <Switch
              checked={contentWarningEnabled}
              onCheckedChange={setContentWarningEnabled}
              aria-label={t("editor.altTextEnableAriaLabel")}
            />
          </Field>
          {contentWarningEnabled ? (
            <Field label={t("editor.contentWarningTextLabel")} orientation="vertical">
              <Input
                value={contentWarning}
                onChange={(event) => setContentWarning(event.target.value)}
                placeholder={t("editor.contentWarningTextPlaceholder")}
              />
            </Field>
          ) : null}
        </FieldGroup>

        <FieldGroup>
          <Field
            label={t("editor.tagsLabel")}
            description={t("editor.tagsDescription")}
            orientation="vertical"
          >
            <Input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder={t("editor.tagsPlaceholder")}
            />
          </Field>
        </FieldGroup>

        {aiStatus.data?.enabled ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="small"
                variant="filled"
                disabled={suggestHashtags.isPending || !body.trim() || !aiProvider}
                onClick={() => suggestHashtags.mutate()}
              >
                <Sparkles />
                {t("editor.suggestHashtags")}
              </Button>
              <AiProviderControl status={aiStatus.data} provider={aiProvider} onChange={setAiProvider} />
            </div>
            {suggestedTags.length ? (
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <Button
                    key={tag}
                    size="small"
                    variant="transparent"
                    disabled={currentTags.has(tag)}
                    onClick={() => addSuggestedTag(tag)}
                  >
                    <Plus />
                    #{tag}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Text variant="strong">{t("editor.altTextHeading")}</Text>
              <Text variant="small" color="tertiary">
                {t("editor.altTextDescription")}
              </Text>
            </div>
            <ImagePlus className="size-4 shrink-0 text-tertiary" />
          </div>

          {altTexts.length === 0 ? (
            <div className="rounded-control border border-dashed border-secondary px-4 py-4 flex flex-col gap-3">
              <Text variant="small" color="secondary">
                {t("editor.altTextEmptyPrefix")}
                <Text as="span" variant="small-mono" color="primary">
                  {t("editor.altTextSyntax")}
                </Text>
                {t("editor.altTextEmptySuffix")}
              </Text>
              <div className="flex items-center gap-2">
                <Input
                  value={manualAltSrc}
                  onChange={(event) => setManualAltSrc(event.target.value)}
                  placeholder={t("editor.altTextUrlPlaceholder")}
                  className="flex-1"
                />
                <Button
                  size="small"
                  variant="filled"
                  disabled={!manualAltSrc.trim()}
                  onClick={() => {
                    const src = manualAltSrc.trim();
                    if (!src) return;
                    setAltTexts((current) =>
                      current.some((entry) => entry.src === src)
                        ? current
                        : [...current, { src, alt: "" }],
                    );
                    setManualAltSrc("");
                  }}
                >
                  <Plus />
                  {t("common.add")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {altTexts.map((entry) => (
                <div
                  key={entry.src}
                  className="rounded-control border border-secondary px-3 py-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Text
                      variant="mini"
                      color="tertiary"
                      className="truncate min-w-0"
                      title={entry.src}
                    >
                      {entry.src}
                    </Text>
                    <Button
                      size="small"
                      variant="transparent"
                      iconOnly
                      aria-label={t("editor.altTextRemoveAriaLabel")}
                      onClick={() =>
                        setAltTexts((current) => current.filter((item) => item.src !== entry.src))
                      }
                    >
                      <X />
                    </Button>
                  </div>
                  <Textarea
                    value={entry.alt}
                    onChange={(event) => {
                      const next = event.target.value;
                      setAltTexts((current) =>
                        current.map((item) =>
                          item.src === entry.src ? { ...item, alt: next } : item,
                        ),
                      );
                    }}
                    placeholder={t("editor.altTextDescriptionPlaceholder")}
                    size="small"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={manualAltSrc}
                  onChange={(event) => setManualAltSrc(event.target.value)}
                  placeholder={t("editor.altTextAddAnother")}
                  className="flex-1"
                />
                <Button
                  size="small"
                  variant="transparent"
                  disabled={!manualAltSrc.trim()}
                  onClick={() => {
                    const src = manualAltSrc.trim();
                    if (!src) return;
                    setAltTexts((current) =>
                      current.some((entry) => entry.src === src)
                        ? current
                        : [...current, { src, alt: "" }],
                    );
                    setManualAltSrc("");
                  }}
                >
                  <Plus />
                  {t("common.add")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <Text variant="small" color="quaternary">
          {t("editor.publishFootnote")}
        </Text>
      </div>
    </ScrollArea>
  );
}
