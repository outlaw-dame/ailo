import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Languages, Palette, UserCog, WandSparkles } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldSet,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Switch,
  Text,
  Toolbar,
  ToolbarContent,
  ToolbarTitle,
  toast,
} from "@glaze/core/components";
import type { NativeThemeInfo } from "@glaze/core/ipc";

import { ProviderCredentials } from "../components/provider-credentials";
import { api } from "../lib/api";
import type { TranslationProvider } from "../lib/types";
import { actionableError } from "../lib/actionable-error";
import { AccountSettings } from "../main/profile-view";
import { FeedsSettings } from "./settings-feeds";

type SettingsPage = "accounts" | "appearance" | "feeds" | "providers" | "translation";

const PAGES: Array<{ id: SettingsPage; label: string; icon: React.ReactNode }> = [
  { id: "accounts", label: "Accounts", icon: <UserCog /> },
  { id: "appearance", label: "Appearance", icon: <Palette /> },
  { id: "feeds", label: "Feeds", icon: <WandSparkles /> },
  { id: "providers", label: "Provider Keys", icon: <KeyRound /> },
  { id: "translation", label: "Translation", icon: <Languages /> },
];

const TARGET_LANGUAGES = [
  ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"],
  ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"], ["pl", "Polish"],
  ["ru", "Russian"], ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"],
] as const;

const TRANSLATORS: Array<{ id: "auto" | TranslationProvider; label: string; note: string }> = [
  { id: "auto", label: "Automatic", note: "Use the first configured translation provider." },
  { id: "deepl", label: "DeepL", note: "Dedicated commercial translation service." },
  { id: "libretranslate", label: "LibreTranslate", note: "Open-source managed or self-hosted translation." },
  { id: "openai", label: "OpenAI", note: "Use the configured OpenAI model for translation." },
  { id: "gemini", label: "Gemini", note: "Use the configured Gemini model for translation." },
];

function AppearanceSettings() {
  const [themeInfo, setThemeInfo] = React.useState<NativeThemeInfo | null>(null);
  const refresh = React.useCallback(async () => setThemeInfo(await window.glazeAPI.nativeTheme.getInfo()), []);
  React.useEffect(() => { void refresh().catch((error) => toast.error(`Failed to get theme info: ${error}`)); }, [refresh]);
  const changeTheme = async (value: string) => {
    try {
      await window.glazeAPI.nativeTheme.setThemeSource(value as "system" | "light" | "dark");
      await refresh();
    } catch (error) { toast.error(`Failed to set theme: ${error}`); }
  };
  return <FieldSet>
    <FieldGroup>
      <Field orientation="horizontal">
        <FieldContent><FieldLabel htmlFor="theme">Theme</FieldLabel></FieldContent>
        <RadioGroup value={themeInfo?.themeSource ?? "system"} onValueChange={changeTheme} orientation="horizontal">
          <Label><RadioGroupItem value="system" />Auto</Label>
          <Label><RadioGroupItem value="light" />Light</Label>
          <Label><RadioGroupItem value="dark" />Dark</Label>
        </RadioGroup>
      </Field>
    </FieldGroup>
  </FieldSet>;
}

function TranslationSettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["fedipod", "translation-settings"], queryFn: api.ai.translationSettings });
  const [provider, setProvider] = React.useState<"auto" | TranslationProvider>("auto");
  const [libreUrl, setLibreUrl] = React.useState("https://libretranslate.com");
  const [autoTranslate, setAutoTranslate] = React.useState(false);
  const [targetLanguage, setTargetLanguage] = React.useState("en");
  React.useEffect(() => {
    if (!settings.data) return;
    setProvider(settings.data.provider ?? "auto");
    setLibreUrl(settings.data.libreTranslateUrl);
    setAutoTranslate(settings.data.autoTranslate);
    setTargetLanguage(settings.data.targetLanguage);
  }, [settings.data]);
  const save = useMutation({
    mutationFn: () => api.ai.saveTranslationSettings({
      provider: provider === "auto" ? null : provider,
      libreTranslateUrl: libreUrl.trim(),
      autoTranslate,
      targetLanguage,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fedipod", "translation-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["fedipod", "ai", "status"] }),
      ]);
      toast.success("Translation settings saved");
    },
    onError: (error: Error) => toast.error(actionableError(error, "Could not save translation settings")),
  });
  const configured = new Set(settings.data?.configuredProviders ?? []);
  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-1">
      <Text variant="strong">Translation provider</Text>
      <Text variant="small" color="tertiary">Choose which backend translates Fediverse posts.</Text>
    </div>
    <RadioGroup value={provider} onValueChange={(value) => setProvider(value as "auto" | TranslationProvider)}>
      {TRANSLATORS.map((translator) => <Label key={translator.id}
        className="flex items-start gap-3 rounded-control border border-secondary px-3 py-2.5">
        <RadioGroupItem value={translator.id} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <Text variant="small-strong">{translator.label}</Text>
            {translator.id !== "auto" ? <Badge color={configured.has(translator.id) ? "green" : undefined}>
              {configured.has(translator.id) ? "Ready" : "Not configured"}
            </Badge> : null}
          </span>
          <Text variant="mini" color="tertiary">{translator.note}</Text>
        </span>
      </Label>)}
    </RadioGroup>
    <Field label="LibreTranslate server URL"
      description="Use HTTPS for remote servers. HTTP is accepted only for localhost self-hosting."
      orientation="vertical">
      <Input value={libreUrl} onChange={(event) => setLibreUrl(event.target.value)}
        placeholder="https://libretranslate.com" spellCheck={false} />
    </Field>
    <Field label="Translate posts to" description="Used by both the Translate button and auto-translation."
      orientation="vertical">
      <select className="h-8 w-full rounded-control border border-field bg-transparent px-2 text-regular text-primary"
        value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
        {TARGET_LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </Field>
    <div className="flex items-start justify-between gap-4 rounded-control border border-secondary px-3 py-3">
      <div className="min-w-0">
        <Text variant="small-strong">Auto inline translation</Text>
        <Text variant="mini" color="tertiary">
          Automatically show translations for short timeline posts without a content warning, sensitive media, attachments, article preview, or filters.
        </Text>
      </div>
      <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate} />
    </div>
    {autoTranslate ? <Text variant="mini" color="tertiary">
      Privacy note: eligible post text is sent automatically to your selected translation provider. This is on by default while a provider is configured, and you can turn it off here.
    </Text> : null}
    <Text variant="mini" color="tertiary">
      DeepL and hosted LibreTranslate keys are entered on Provider Keys. A self-hosted LibreTranslate server may not require one.
    </Text>
    {settings.isError ? <Text variant="mini" color="danger">{actionableError(settings.error, "Could not load translation settings")}</Text> : null}
    <Button variant="accent" className="self-start" disabled={save.isPending || !libreUrl.trim()}
      onClick={() => save.mutate()}>Save translation settings</Button>
  </div>;
}

export function SettingsView({ embedded = false }: { embedded?: boolean } = {}) {
  const [page, setPage] = React.useState<SettingsPage>("accounts");
  React.useEffect(() => {
    if (embedded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
        || (el instanceof HTMLElement && el.isContentEditable)
        || document.querySelector("[data-radix-popper-content-wrapper]")) return;
      event.preventDefault(); void window.glazeAPI.glaze.ipc.invoke("window:closeSettings");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [embedded]);

  return <div className="flex h-full flex-col">
    <Toolbar><ToolbarContent><ToolbarTitle>Settings</ToolbarTitle></ToolbarContent></Toolbar>
    <div className="flex min-h-0 flex-1 border-t border-secondary">
      <nav aria-label="Settings sections" className="flex w-44 shrink-0 flex-col gap-1 border-r border-secondary p-3">
        {PAGES.map((item) => <Button key={item.id} variant={page === item.id ? "filled" : "transparent"}
          className="justify-start" aria-current={page === item.id ? "page" : undefined}
          onClick={() => setPage(item.id)}>{item.icon}{item.label}</Button>)}
      </nav>
      <ScrollArea className="min-w-0 flex-1">
        <main className="flex flex-col gap-5 p-5 pb-10">
          <div><Text as="h2" variant="heading2">{PAGES.find((item) => item.id === page)?.label}</Text></div>
          {page === "accounts" ? <AccountSettings /> : null}
          {page === "appearance" ? <AppearanceSettings /> : null}
          {page === "feeds" ? <FeedsSettings /> : null}
          {page === "providers" ? <ProviderCredentials /> : null}
          {page === "translation" ? <TranslationSettingsPage /> : null}
        </main>
      </ScrollArea>
    </div>
  </div>;
}
