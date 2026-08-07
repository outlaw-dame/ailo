import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Eye, ImagePlus, Plus, Save, Send, X } from "lucide-react";
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

  React.useEffect(() => {
    if (!postId) {
      setTitle("");
      setBody(
        "# A note worth sharing\n\nWrite in **Markdown**, drop in <em>HTML</em>, and use emoji 🌿 freely.\n\n![A descriptive image](https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200)\n",
      );
      setContentWarningEnabled(false);
      setContentWarning("");
      setAltTexts([]);
      setTagsInput("knowledge, open-web");
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
  }, [postId, existingQuery.data, hydratedId]);

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
        title: title.trim() || "Untitled",
        body,
        contentWarning: contentWarningEnabled ? contentWarning.trim() || "Sensitive content" : null,
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
        const bits: string[] = ["Published locally"];
        if (result.results && "solid" in result.results && result.results.solid) {
          bits.push(result.results.solid.ok ? "Solid Pod" : `Solid failed`);
        }
        if (result.results && "github" in result.results && result.results.github) {
          bits.push(result.results.github.ok ? "GitHub" : `GitHub failed`);
        }
        toast.success(bits.join(" · "));
        if (result.results && "solid" in result.results && result.results.solid && !result.results.solid.ok) {
          toast.error(result.results.solid.error);
        }
        if (result.results && "github" in result.results && result.results.github && !result.results.github.ok) {
          toast.error(result.results.github.error);
        }
      } else {
        toast.success("Draft saved");
      }
      void navigate({ to: "/post/$postId", params: { postId: result.post.id } });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not save note");
    },
  });

  const busy = saveMutation.isPending;

  return (
    <ScrollArea
      title={isEditing ? "Edit note" : "Write"}
      subtitle="Markdown · HTML · emoji"
      leading={
        <ToolbarBackButton
          onClick={() => {
            void navigate({ to: isEditing && postId ? "/post/$postId" : "/", params: postId ? { postId } : undefined });
          }}
        />
      }
      actions={
        <div className="flex items-center gap-1.5">
          <SegmentedControl
            size="small"
            value={mode}
            onValueChange={(value) => setMode(value as EditorMode)}
            aria-label="Editor mode"
          >
            <SegmentedControlItem value="write">Write</SegmentedControlItem>
            <SegmentedControlItem value="preview">
              <Eye />
              Preview
            </SegmentedControlItem>
          </SegmentedControl>
          <Button
            size="small"
            variant="filled"
            disabled={busy}
            onClick={() => saveMutation.mutate("draft")}
          >
            <Save />
            Save draft
          </Button>
          <Button
            size="small"
            variant="accent"
            disabled={busy}
            onClick={() => saveMutation.mutate("published")}
          >
            <Send />
            Publish
          </Button>
        </div>
      }
      className="h-full"
    >
      <div className="px-8 py-6 max-w-3xl flex flex-col gap-5">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          size="large"
          className="text-heading2! font-normal! h-auto! py-2!"
          aria-label="Title"
        />

        {mode === "write" ? (
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write freely. Markdown, HTML, and emoji all work."
            aria-label="Body"
            spellCheck
            className="w-full min-h-[320px] max-h-[60vh] resize-y rounded-control border border-field bg-transparent px-3 py-3 text-regular leading-relaxed text-primary outline-none focus:border-foreground-40 placeholder:text-quaternary"
          />
        ) : (
          <div className="min-h-[320px] rounded-control border border-secondary bg-well/40 px-5 py-4">
            {body.trim() ? (
              <MarkdownPreview body={body} altTexts={altTexts} />
            ) : (
              <Text color="tertiary">Nothing to preview yet.</Text>
            )}
          </div>
        )}

        <FieldGroup>
          <Field
            label="Content warning"
            description="Hide the body behind a short warning until the reader chooses to reveal it."
            orientation="horizontal"
          >
            <Switch
              checked={contentWarningEnabled}
              onCheckedChange={setContentWarningEnabled}
              aria-label="Enable content warning"
            />
          </Field>
          {contentWarningEnabled ? (
            <Field label="Warning text" orientation="vertical">
              <Input
                value={contentWarning}
                onChange={(event) => setContentWarning(event.target.value)}
                placeholder="e.g. Discussion of burnout"
              />
            </Field>
          ) : null}
        </FieldGroup>

        <FieldGroup>
          <Field
            label="Tags"
            description="Comma-separated topics that help others find this knowledge."
            orientation="vertical"
          >
            <Input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="knowledge, solid, accessibility"
            />
          </Field>
        </FieldGroup>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Text variant="strong">Alt text</Text>
              <Text variant="small" color="tertiary">
                Describe every image so the knowledge stays accessible.
              </Text>
            </div>
            <ImagePlus className="size-4 shrink-0 text-tertiary" />
          </div>

          {altTexts.length === 0 ? (
            <div className="rounded-control border border-dashed border-secondary px-4 py-4 flex flex-col gap-3">
              <Text variant="small" color="secondary">
                No images detected yet. Add Markdown images like
                {" "}
                <Text as="span" variant="small-mono" color="primary">
                  ![caption](url)
                </Text>
                {" "}or attach a source manually.
              </Text>
              <div className="flex items-center gap-2">
                <Input
                  value={manualAltSrc}
                  onChange={(event) => setManualAltSrc(event.target.value)}
                  placeholder="https://…/image.png"
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
                  Add
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
                    <Text variant="mini" color="tertiary" className="truncate min-w-0" title={entry.src}>
                      {entry.src}
                    </Text>
                    <Button
                      size="small"
                      variant="transparent"
                      iconOnly
                      aria-label="Remove alt text entry"
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
                    placeholder="Describe what the image shows"
                    size="small"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={manualAltSrc}
                  onChange={(event) => setManualAltSrc(event.target.value)}
                  placeholder="Add another image URL"
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
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>

        <Text variant="small" color="quaternary">
          Publish saves locally and pushes to any connected Solid Pod and GitHub repository.
        </Text>
      </div>
    </ScrollArea>
  );
}
