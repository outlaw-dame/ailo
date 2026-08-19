import * as React from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl, SegmentedControlItem } from "@glaze/core/components";

import type { AiProvider, AiStatus } from "../lib/types";
import { preferredAiProvider } from "../lib/ai-provider";

const STORAGE_KEY = "ailo.ai.provider";

export function useAiProvider(status: AiStatus | undefined): [AiProvider | null, (provider: AiProvider) => void] {
  const [provider, setProviderState] = React.useState<AiProvider | null>(null);
  React.useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* storage can be disabled */ }
    setProviderState(preferredAiProvider(status, saved));
  }, [status]);
  const setProvider = React.useCallback((next: AiProvider) => {
    setProviderState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* selection still works for this session */ }
  }, []);
  return [provider, setProvider];
}

export function AiProviderControl({
  status,
  provider,
  onChange,
}: {
  status: AiStatus | undefined;
  provider: AiProvider | null;
  onChange: (provider: AiProvider) => void;
}) {
  const { t } = useTranslation();
  if (!provider || !status || status.providers.length < 2) return null;
  return (
    <SegmentedControl
      size="small"
      value={provider}
      onValueChange={(value) => onChange(value as AiProvider)}
      aria-label={t("aiProvider.ariaLabel")}
    >
      {status.providers.includes("openai") ? <SegmentedControlItem value="openai">{t("aiProvider.chatgpt")}</SegmentedControlItem> : null}
      {status.providers.includes("gemini") ? <SegmentedControlItem value="gemini">{t("aiProvider.gemini")}</SegmentedControlItem> : null}
    </SegmentedControl>
  );
}
