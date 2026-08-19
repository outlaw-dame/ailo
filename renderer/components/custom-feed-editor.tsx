import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Save, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Input, Text, Textarea, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import type { CustomFeed, CustomFeedInput } from "../lib/types";

const EMPTY: CustomFeedInput = {
  name: "", description: "", avatarUrl: null, bannerUrl: null,
  accounts: [], hashtags: [], semanticKeywords: [], excludeWords: [], excludeAccounts: [],
};
const lines = (value: string) => [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];
const text = (values: string[]) => values.join("\n");
type ListField = "accounts" | "hashtags" | "semanticKeywords" | "excludeWords" | "excludeAccounts";

// The list fields (accounts/hashtags/topics/exclusions) edit as raw textarea
// text, not the string[] they end up as — lines()/text() only run at the
// save boundary. Feeding lines(value) back into the controlled value on
// every keystroke used to filter out a just-typed trailing blank line (the
// one Enter leaves before you type the next entry), so the newline vanished
// the instant you pressed it: pressing Enter to start a new hashtag (or
// account, or topic, or exclusion — every field here shares setList)
// appeared to do nothing.
type DraftText = Omit<CustomFeedInput, ListField> & Record<ListField, string>;
const toDraftText = (input: CustomFeedInput): DraftText => ({
  ...input,
  accounts: text(input.accounts), hashtags: text(input.hashtags), semanticKeywords: text(input.semanticKeywords),
  excludeWords: text(input.excludeWords), excludeAccounts: text(input.excludeAccounts),
});
const toCustomFeedInput = (draft: DraftText): CustomFeedInput => ({
  ...draft,
  accounts: lines(draft.accounts), hashtags: lines(draft.hashtags), semanticKeywords: lines(draft.semanticKeywords),
  excludeWords: lines(draft.excludeWords), excludeAccounts: lines(draft.excludeAccounts),
});

/** Create or edit a custom feed's rules. `initial: null` creates; otherwise edits in place. */
export function CustomFeedEditor({ initial, onSaved }: { initial: CustomFeed | null; onSaved: (feed: CustomFeed) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<DraftText>(toDraftText(initial ?? EMPTY));
  const [uploading, setUploading] = React.useState<"avatarUrl" | "bannerUrl" | null>(null);
  const [aiPrompt, setAiPrompt] = React.useState("");
  const aiStatus = useQuery({ queryKey: ["fedipod", "ai-status"], queryFn: api.ai.status });
  React.useEffect(() => setDraft(toDraftText(initial ?? EMPTY)), [initial]);
  const setList = (key: ListField, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () => api.fedipod.saveCustomFeed(toCustomFeedInput(draft), initial?.id),
    onSuccess: async (feed) => {
      await queryClient.invalidateQueries({ queryKey: ["fedipod", "custom-feeds"] });
      onSaved(feed);
      toast.success(initial ? t("customFeedEditor.saveSuccess") : t("customFeedEditor.createSuccess"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const draftWithAi = useMutation({
    mutationFn: () => api.ai.draftCustomFeed(aiPrompt),
    onSuccess: (result) => { setDraft(toDraftText(result)); toast.success(t("customFeedEditor.draftSuccess")); },
    onError: (error: Error) => toast.error(error.message),
  });
  const hasSource = lines(draft.accounts).length + lines(draft.hashtags).length + lines(draft.semanticKeywords).length > 0;
  const uploadImage = async (key: "avatarUrl" | "bannerUrl", file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(t("customFeedEditor.chooseImageError"));
    setUploading(key);
    try {
      const media = await api.fedipod.uploadMedia({ filename: file.name, mimeType: file.type, data: await file.arrayBuffer() });
      setDraft((current) => ({ ...current, [key]: media.url }));
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setUploading(null); }
  };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text variant="strong">{initial ? t("customFeedEditor.titleEdit") : t("customFeedEditor.titleCreate")}</Text>
        <Text variant="small" color="tertiary">{t("customFeedEditor.rulesNote")}</Text>
      </div>
      {aiStatus.data?.enabled ? <div className="flex flex-col gap-1 rounded-card border border-secondary bg-control-subtle p-3">
        <Text variant="small-strong">{aiStatus.data.defaultProvider === "gemini" ? t("customFeedEditor.draftWithGemini") : t("customFeedEditor.draftWithOpenAI")}</Text>
        <Text variant="mini" color="tertiary">{t("customFeedEditor.draftNote")}</Text>
        <div className="mt-2 flex gap-2"><Input value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder={t("customFeedEditor.draftPromptPlaceholder")} maxLength={4000} /><Button disabled={!aiPrompt.trim() || draftWithAi.isPending} onClick={() => draftWithAi.mutate()}><WandSparkles />{draftWithAi.isPending ? t("customFeedEditor.draftButtonPending") : t("customFeedEditor.draftButton")}</Button></div>
      </div> : null}
      <Input value={draft.name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} placeholder={t("customFeedEditor.feedNamePlaceholder")} aria-label={t("customFeedEditor.feedNameAriaLabel")} maxLength={80} />
      <Textarea value={draft.description} onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))} placeholder={t("customFeedEditor.feedDescriptionPlaceholder")} aria-label={t("customFeedEditor.feedDescriptionAriaLabel")} maxLength={500} rows={3} />
      <div className="grid gap-3 sm:grid-cols-2">
        {(["avatarUrl", "bannerUrl"] as const).map((key) => <div key={key} className="overflow-hidden rounded-card border border-secondary bg-control-subtle">
          <div className={`relative ${key === "avatarUrl" ? "aspect-square max-h-36" : "aspect-[3/1]"}`}>
            {draft[key] ? <img src={draft[key]!} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Image className="size-6 text-tertiary" /></div>}
          </div>
          <div className="flex items-center gap-2 p-2">
            <label className="cursor-pointer text-sm font-medium"><input className="sr-only" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" disabled={Boolean(uploading)} onChange={(event) => { void uploadImage(key, event.target.files?.[0]); event.currentTarget.value = ""; }} />{uploading === key ? t("customFeedEditor.uploading") : key === "avatarUrl" ? t("customFeedEditor.profileImage") : t("customFeedEditor.bannerImage")}</label>
            {draft[key] ? <Button size="small" variant="transparent" className="ml-auto" onClick={() => setDraft((current) => ({ ...current, [key]: null }))}>{t("customFeedEditor.removeImage")}</Button> : null}
          </div>
        </div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <Text variant="small-strong">{t("customFeedEditor.peopleTitle")}</Text>
          <Text variant="mini" color="tertiary">{t("customFeedEditor.peopleNote")}</Text>
          <Textarea value={draft.accounts} onChange={(event) => setList("accounts", event.target.value)} placeholder={t("customFeedEditor.peoplePlaceholder")} rows={4} />
        </label>
        <label className="flex flex-col gap-1.5">
          <Text variant="small-strong">{t("customFeedEditor.hashtagsTitle")}</Text>
          <Text variant="mini" color="tertiary">{t("customFeedEditor.hashtagsNote")}</Text>
          <Textarea value={draft.hashtags} onChange={(event) => setList("hashtags", event.target.value)} placeholder={t("customFeedEditor.hashtagsPlaceholder")} rows={4} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2"><WandSparkles className="size-4" /><Text variant="small-strong">{t("customFeedEditor.topicsTitle")}</Text><Badge size="small">{t("customFeedEditor.topicsBadge")}</Badge></span>
        <Text variant="mini" color="tertiary">{t("customFeedEditor.topicsNote")}</Text>
        <Textarea value={draft.semanticKeywords} onChange={(event) => setList("semanticKeywords", event.target.value)} placeholder={t("customFeedEditor.topicsPlaceholder")} rows={4} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <Text variant="small-strong">{t("customFeedEditor.excludeWordsTitle")}</Text>
          <Textarea value={draft.excludeWords} onChange={(event) => setList("excludeWords", event.target.value)} placeholder={t("customFeedEditor.excludeWordsPlaceholder")} rows={3} />
        </label>
        <label className="flex flex-col gap-1.5">
          <Text variant="small-strong">{t("customFeedEditor.excludeAccountsTitle")}</Text>
          <Textarea value={draft.excludeAccounts} onChange={(event) => setList("excludeAccounts", event.target.value)} placeholder={t("customFeedEditor.excludeAccountsPlaceholder")} rows={3} />
        </label>
      </div>
      <Button className="self-end" variant="accent" disabled={save.isPending || !draft.name.trim() || !hasSource} onClick={() => save.mutate()}>
        <Save />{initial ? t("customFeedEditor.saveButton") : t("customFeedEditor.createButton")}
      </Button>
    </div>
  );
}
