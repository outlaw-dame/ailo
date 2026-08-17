import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Languages, Palette, ShieldCheck, UserCog, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { languageName } from "../lib/translation";
import { AccountSettings } from "../main/profile-view";
import { FeedsSettings } from "./settings-feeds";
import { ModerationSettings } from "./settings-moderation";

type SettingsPage = "accounts" | "appearance" | "feeds" | "moderation" | "providers" | "translation";

// Display labels come from t(`settingsNav.${id}`) at render time — this
// array is just the id/icon pairing and iteration order.
const PAGE_IDS: SettingsPage[] = ["accounts", "appearance", "feeds", "moderation", "providers", "translation"];
const PAGE_ICONS: Record<SettingsPage, React.ReactNode> = {
  accounts: <UserCog />,
  appearance: <Palette />,
  feeds: <WandSparkles />,
  moderation: <ShieldCheck />,
  providers: <KeyRound />,
  translation: <Languages />,
};
// settingsNav.safety is the label for the "moderation" page id — the page
// was renamed to "Safety" in the UI without renaming its internal id.
const PAGE_LABEL_KEY: Record<SettingsPage, string> = {
  accounts: "settingsNav.accounts",
  appearance: "settingsNav.appearance",
  feeds: "settingsNav.feeds",
  moderation: "settingsNav.safety",
  providers: "settingsNav.providerKeys",
  translation: "settingsNav.translation",
};

// Language names are locale data, not UI copy — derived from Intl.DisplayNames
// via languageName() rather than hardcoded, so they follow the reader's own
// locale instead of needing a translated copy per supported UI language.
const TARGET_LANGUAGE_CODES = ["en", "es", "fr", "de", "it", "pt", "nl", "pl", "ru", "ja", "ko", "zh"] as const;

const TRANSLATOR_IDS: Array<"auto" | TranslationProvider> = ["auto", "deepl", "libretranslate", "openai", "gemini"];
const TRANSLATOR_LABEL_KEY: Record<string, string> = {
  auto: "translation.auto", deepl: "translation.deepl",
  libretranslate: "translation.libretranslate", openai: "translation.openai", gemini: "translation.gemini",
};
const TRANSLATOR_NOTE_KEY: Record<string, string> = {
  auto: "translation.autoNote", deepl: "translation.deeplNote",
  libretranslate: "translation.libretranslateNote", openai: "translation.openaiNote", gemini: "translation.geminiNote",
};

function AppearanceSettings() {
  const { t } = useTranslation();
  const [themeInfo, setThemeInfo] = React.useState<NativeThemeInfo | null>(null);
  const refresh = React.useCallback(async () => setThemeInfo(await window.glazeAPI.nativeTheme.getInfo()), []);
  React.useEffect(() => { void refresh().catch((error) => toast.error(t("appearance.themeInfoError", { error }))); }, [refresh, t]);
  const changeTheme = async (value: string) => {
    try {
      await window.glazeAPI.nativeTheme.setThemeSource(value as "system" | "light" | "dark");
      await refresh();
    } catch (error) { toast.error(t("appearance.themeSetError", { error })); }
  };
  return <FieldSet>
    <FieldGroup>
      <Field orientation="horizontal">
        <FieldContent><FieldLabel htmlFor="theme">{t("appearance.themeLabel")}</FieldLabel></FieldContent>
        <RadioGroup value={themeInfo?.themeSource ?? "system"} onValueChange={changeTheme} orientation="horizontal">
          <Label><RadioGroupItem value="system" />{t("appearance.themeAuto")}</Label>
          <Label><RadioGroupItem value="light" />{t("appearance.themeLight")}</Label>
          <Label><RadioGroupItem value="dark" />{t("appearance.themeDark")}</Label>
        </RadioGroup>
      </Field>
    </FieldGroup>
  </FieldSet>;
}

function TranslationSettingsPage() {
  const { t } = useTranslation();
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
      toast.success(t("translation.saveSuccess"));
    },
    onError: (error: Error) => toast.error(actionableError(error, t("translation.saveError"))),
  });
  const configured = new Set(settings.data?.configuredProviders ?? []);
  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-1">
      <Text variant="strong">{t("translation.providerTitle")}</Text>
      <Text variant="small" color="tertiary">{t("translation.providerDescription")}</Text>
    </div>
    <RadioGroup value={provider} onValueChange={(value) => setProvider(value as "auto" | TranslationProvider)}>
      {TRANSLATOR_IDS.map((id) => <Label key={id}
        className="flex items-start gap-3 rounded-control border border-secondary px-3 py-2.5">
        <RadioGroupItem value={id} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <Text variant="small-strong">{t(TRANSLATOR_LABEL_KEY[id])}</Text>
            {id !== "auto" ? <Badge color={configured.has(id) ? "green" : undefined}>
              {configured.has(id) ? t("translation.ready") : t("translation.notConfigured")}
            </Badge> : null}
          </span>
          <Text variant="mini" color="tertiary">{t(TRANSLATOR_NOTE_KEY[id])}</Text>
        </span>
      </Label>)}
    </RadioGroup>
    <Field label={t("translation.libreUrlLabel")}
      description={t("translation.libreUrlDescription")}
      orientation="vertical">
      <Input value={libreUrl} onChange={(event) => setLibreUrl(event.target.value)}
        placeholder={t("translation.libreUrlPlaceholder")} spellCheck={false} />
    </Field>
    <Field label={t("translation.targetLanguageLabel")} description={t("translation.targetLanguageDescription")}
      orientation="vertical">
      <select className="h-8 w-full rounded-control border border-field bg-transparent px-2 text-regular text-primary"
        value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
        {TARGET_LANGUAGE_CODES.map((code) => <option key={code} value={code}>{languageName(code) ?? code}</option>)}
      </select>
    </Field>
    <div className="flex items-start justify-between gap-4 rounded-control border border-secondary px-3 py-3">
      <div className="min-w-0">
        <Text variant="small-strong">{t("translation.autoTranslateTitle")}</Text>
        <Text variant="mini" color="tertiary">
          {t("translation.autoTranslateDescription")}
        </Text>
      </div>
      <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate} />
    </div>
    {autoTranslate ? <Text variant="mini" color="tertiary">
      {t("translation.autoTranslatePrivacyNote")}
    </Text> : null}
    <Text variant="mini" color="tertiary">
      {t("translation.providerKeysNote")}
    </Text>
    {settings.isError ? <Text variant="mini" color="danger">{actionableError(settings.error, t("translation.loadError"))}</Text> : null}
    <Button variant="accent" className="self-start" disabled={save.isPending || !libreUrl.trim()}
      onClick={() => save.mutate()}>{t("translation.saveButton")}</Button>
  </div>;
}

const PAGE_ID_SET = new Set<SettingsPage>(PAGE_IDS);

// A fresh settings window can be opened straight to a page (see
// windows/settings-window.ts's `initialPage` — used by the weekly-digest
// notification's click handler) via a `?page=` query param, read once here.
function initialPageFromUrl(): SettingsPage {
  const requested = new URLSearchParams(window.location.search).get("page");
  return requested && PAGE_ID_SET.has(requested as SettingsPage) ? (requested as SettingsPage) : "accounts";
}

export function SettingsView({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  // Embedded settings share the main window's URL, which was never given a
  // `?page=` for this purpose — only a dedicated settings window's own URL is.
  const [page, setPage] = React.useState<SettingsPage>(() => (embedded ? "accounts" : initialPageFromUrl()));
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
    <Toolbar><ToolbarContent><ToolbarTitle>{t("settingsNav.title")}</ToolbarTitle></ToolbarContent></Toolbar>
    <div className="flex min-h-0 flex-1 border-t border-secondary">
      <nav aria-label={t("settingsNav.sectionsAriaLabel")} className="flex w-44 shrink-0 flex-col gap-1 border-r border-secondary p-3">
        {PAGE_IDS.map((id) => <Button key={id} variant={page === id ? "filled" : "transparent"}
          className="justify-start" aria-current={page === id ? "page" : undefined}
          onClick={() => setPage(id)}>{PAGE_ICONS[id]}{t(PAGE_LABEL_KEY[id])}</Button>)}
      </nav>
      <ScrollArea className="min-w-0 flex-1">
        <main className="flex flex-col gap-5 p-5 pb-10">
          <div><Text as="h2" variant="heading2">{t(PAGE_LABEL_KEY[page])}</Text></div>
          {page === "accounts" ? <AccountSettings /> : null}
          {page === "appearance" ? <AppearanceSettings /> : null}
          {page === "feeds" ? <FeedsSettings /> : null}
          {page === "moderation" ? <ModerationSettings /> : null}
          {page === "providers" ? <ProviderCredentials /> : null}
          {page === "translation" ? <TranslationSettingsPage /> : null}
        </main>
      </ScrollArea>
    </div>
  </div>;
}
