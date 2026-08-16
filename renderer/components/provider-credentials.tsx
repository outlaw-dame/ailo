import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Field, Input, Text, toast } from "@glaze/core/components";

import { api } from "../lib/api";
import { actionableError } from "../lib/actionable-error";
import type { ProviderCredential } from "../lib/types";

const PROVIDERS: Array<{
  id: ProviderCredential;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    id: "openai",
    label: "OpenAI / ChatGPT",
    description: "Used for ChatGPT writing assistance and optional remote semantic filters.",
    placeholder: "Paste an OpenAI API key",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Used for Gemini writing assistance and optional Gemini embeddings.",
    placeholder: "Paste a Gemini API key",
  },
  {
    id: "safe_browsing",
    label: "Google Safe Browsing",
    description: "Checks a link with Google only after you choose to open it.",
    placeholder: "Paste a Google Safe Browsing API key",
  },
  {
    id: "klipy",
    label: "KLIPY GIFs",
    description: "Searches KLIPY from FediPod; the key is never exposed to Ailo's renderer.",
    placeholder: "Paste a KLIPY API key",
  },
  {
    id: "deepl",
    label: "DeepL Translate",
    description: "Translates posts with DeepL Free or Pro. Free keys ending in :fx are detected automatically.",
    placeholder: "Paste a DeepL API authentication key",
  },
  {
    id: "libretranslate",
    label: "LibreTranslate",
    description: "Optional for self-hosted servers; required by managed servers that enforce API keys.",
    placeholder: "Paste a LibreTranslate API key",
  },
];

const EMPTY_KEYS: Record<ProviderCredential, string> = {
  openai: "",
  gemini: "",
  safe_browsing: "",
  klipy: "",
  deepl: "",
  libretranslate: "",
};

export function ProviderCredentials() {
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
      toast.success("API key saved securely in FediPod");
    },
    onError: (error: Error) => toast.error(actionableError(error, "Could not save API key")),
  });
  const remove = useMutation({
    mutationFn: api.ai.removeCredential,
    onSuccess: async () => {
      await refresh();
      toast.success("Saved API key removed");
    },
    onError: (error: Error) => toast.error(actionableError(error, "Could not remove API key")),
  });
  const testCredential = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: ProviderCredential; apiKey?: string }) =>
      api.ai.testCredential(provider, apiKey),
    onSuccess: (result) => toast.success(
      `${PROVIDERS.find((provider) => provider.id === result.provider)?.label || "Provider"} key works`,
    ),
    onError: (error: Error) => toast.error(actionableError(error, "Credential test failed")),
  });

  return (
    <div className="flex flex-col gap-3 rounded-control border border-secondary px-3 py-3">
      <div className="flex flex-col gap-1">
        <Text variant="small-strong">Provider API keys</Text>
        <Text variant="mini" color="tertiary">
          Keys are saved only in this FediPod identity's owner-only local file. They are never
          copied to your Solid Pod, published to the Fediverse, or returned to Ailo after saving.
        </Text>
      </div>
      {credentials.isError ? (
        <Text variant="mini" color="danger">{actionableError(credentials.error, "Could not load provider keys")}</Text>
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
                <Badge color="green">{state.source === "local" ? "Saved locally" : "From environment"}</Badge>
              ) : <Badge>Not configured</Badge>}
            </div>
            <Field label="API key" description={provider.description} orientation="vertical">
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={candidate}
                onChange={(event) => setKeys((current) => ({
                  ...current,
                  [provider.id]: event.target.value,
                }))}
                placeholder={state?.configured ? "Enter a replacement key" : provider.placeholder}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="small" variant="accent" disabled={busy || !candidate.trim()}
                onClick={() => save.mutate({ provider: provider.id, apiKey: candidate })}>
                {state?.configured ? "Replace key" : "Save key"}
              </Button>
              <Button size="small" variant="filled" disabled={busy || (!candidate.trim() && !state?.configured)}
                onClick={() => testCredential.mutate({
                  provider: provider.id,
                  apiKey: candidate.trim() || undefined,
                })}>
                {candidate.trim() ? "Test entered key" : "Test saved key"}
              </Button>
              {state?.source === "local" ? (
                <Button size="small" variant="transparent" disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Remove the saved ${provider.label} key from FediPod?`)) {
                      remove.mutate(provider.id);
                    }
                  }}>
                  Remove saved key
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
      <Text variant="mini" color="quaternary">
        Safe Browsing is an advisory service and may have false positives or negatives. Google
        receives the full URL only when you request a check; review Google's terms before use,
        especially for commercial products.
      </Text>
    </div>
  );
}
