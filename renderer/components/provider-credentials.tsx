import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Button, Field, Input, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import { actionableError } from "../lib/actionable-error";
import type { ProviderCredential } from "../lib/types";

const PROVIDER_IDS: ProviderCredential[] = ["openai", "gemini", "safe_browsing", "klipy", "deepl", "libretranslate"];

const EMPTY_KEYS: Record<ProviderCredential, string> = {
  openai: "",
  gemini: "",
  safe_browsing: "",
  klipy: "",
  deepl: "",
  libretranslate: "",
};

export function ProviderCredentials() {
  const { t } = useTranslation();
  const PROVIDERS = React.useMemo(() => PROVIDER_IDS.map((id) => ({
    id,
    label: t(`providerCredentials.${id}.label`),
    description: t(`providerCredentials.${id}.description`),
    placeholder: t(`providerCredentials.${id}.placeholder`),
  })), [t]);
  const queryClient = useQueryClient();
  const [keys, setKeys] = React.useState(EMPTY_KEYS);
  const credentials = useQuery({
    queryKey: ["fedipod", "provider-credentials"],
    queryFn: api.ai.credentials,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fedipod", "provider-credentials"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "ai", "status"] }),
      queryClient.invalidateQueries({ queryKey: ["fedipod", "translation-settings"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: ProviderCredential; apiKey: string }) =>
      api.ai.saveCredential(provider, apiKey),
    onSuccess: async (_result, variables) => {
      setKeys((current) => ({ ...current, [variables.provider]: "" }));
      await refresh();
      toast.success(t("providerCredentials.saveSuccess"));
    },
    onError: (error: Error) => toast.error(actionableError(error, t("providerCredentials.saveError"))),
  });
  const remove = useMutation({
    mutationFn: api.ai.removeCredential,
    onSuccess: async () => {
      await refresh();
      toast.success(t("providerCredentials.removeSuccess"));
    },
    onError: (error: Error) => toast.error(actionableError(error, t("providerCredentials.removeError"))),
  });
  const testCredential = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: ProviderCredential; apiKey?: string }) =>
      api.ai.testCredential(provider, apiKey),
    onSuccess: (result) => toast.success(
      t("providerCredentials.testSuccess", {
        label: PROVIDERS.find((provider) => provider.id === result.provider)?.label
          || t("providerCredentials.unknownProviderLabel"),
      }),
    ),
    onError: (error: Error) => toast.error(actionableError(error, t("providerCredentials.testError"))),
  });

  return (
    <div className="flex flex-col gap-3 rounded-control border border-secondary px-3 py-3">
      <div className="flex flex-col gap-1">
        <Text variant="small-strong">{t("providerCredentials.title")}</Text>
        <Text variant="mini" color="tertiary">
          {t("providerCredentials.description")}
        </Text>
      </div>
      {credentials.isError ? (
        <Text variant="mini" color="danger">{actionableError(credentials.error, t("providerCredentials.loadError"))}</Text>
      ) : null}
      {PROVIDERS.map((provider) => {
        const state = credentials.data?.[provider.id];
        const candidate = keys[provider.id];
        const busy = (save.isPending && save.variables?.provider === provider.id)
          || (remove.isPending && remove.variables === provider.id)
          || (testCredential.isPending && testCredential.variables?.provider === provider.id);
        return (
          <div key={provider.id} className="flex flex-col gap-2 border-t border-secondary pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-2">
              <Text variant="small-strong">{provider.label}</Text>
              {state?.configured ? (
                <Badge color="green">{state.source === "local" ? t("providerCredentials.savedLocally") : t("providerCredentials.fromEnvironment")}</Badge>
              ) : <Badge>{t("translation.notConfigured")}</Badge>}
            </div>
            <Field label={t("providerCredentials.apiKeyLabel")} description={provider.description} orientation="vertical">
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={candidate}
                onChange={(event) => setKeys((current) => ({
                  ...current,
                  [provider.id]: event.target.value,
                }))}
                placeholder={state?.configured ? t("providerCredentials.replacePlaceholder") : provider.placeholder}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="small" variant="accent" disabled={busy || !candidate.trim()}
                onClick={() => save.mutate({ provider: provider.id, apiKey: candidate })}>
                {state?.configured ? t("providerCredentials.replaceButton") : t("providerCredentials.saveButton")}
              </Button>
              <Button size="small" variant="filled" disabled={busy || (!candidate.trim() && !state?.configured)}
                onClick={() => testCredential.mutate({
                  provider: provider.id,
                  apiKey: candidate.trim() || undefined,
                })}>
                {candidate.trim() ? t("providerCredentials.testEnteredButton") : t("providerCredentials.testSavedButton")}
              </Button>
              {state?.source === "local" ? (
                <Button size="small" variant="transparent" disabled={busy}
                  onClick={() => {
                    if (window.confirm(t("providerCredentials.removeConfirm", { label: provider.label }))) {
                      remove.mutate(provider.id);
                    }
                  }}>
                  {t("providerCredentials.removeButton")}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
      <Text variant="mini" color="quaternary">
        {t("providerCredentials.safeBrowsingDisclaimer")}
      </Text>
    </div>
  );
}
