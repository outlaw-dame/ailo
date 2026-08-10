import type { AiProvider, AiStatus } from "./types";

export function preferredAiProvider(status: AiStatus | undefined, saved?: string | null): AiProvider | null {
  if (!status?.enabled) return null;
  if ((saved === "openai" || saved === "gemini") && status.providers.includes(saved)) return saved;
  return status.defaultProvider && status.providers.includes(status.defaultProvider)
    ? status.defaultProvider : status.providers[0] ?? null;
}
