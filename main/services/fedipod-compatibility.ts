import type { FediPodCompatibility } from "../types.js";

export const AILO_FEDIPOD_API_VERSION = 1;
export const REQUIRED_FEDIPOD_FEATURES = [
  "tag_timeline", "public_feed", "media_upload", "klipy_gif_search", "translation_providers",
  "translation_preferences",
  "open_media_formats",
  "custom_feeds", "account_lists", "domain_blocks", "ai_feeds",
] as const;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Fail closed when the running agent does not prove the API contract Ailo needs. */
export function parseFediPodCompatibility(raw: unknown): FediPodCompatibility {
  const config = record(record(raw).configuration);
  const advertised = record(config.ailo);
  const apiVersion = advertised.api_version;
  const minAiloApiVersion = advertised.min_ailo_api_version;
  const fedipodVersion = advertised.fedipod_version;
  const features = Array.isArray(advertised.features)
    ? advertised.features.filter((value): value is string => typeof value === "string")
    : [];

  if (typeof apiVersion !== "number" || !Number.isSafeInteger(apiVersion)
    || typeof minAiloApiVersion !== "number" || !Number.isSafeInteger(minAiloApiVersion)
    || typeof fedipodVersion !== "string" || !fedipodVersion.trim()) {
    throw new Error(
      "This FediPod is too old to prove Ailo compatibility. Update and restart FediPod.",
    );
  }
  if (apiVersion !== AILO_FEDIPOD_API_VERSION) {
    throw new Error(
      apiVersion > AILO_FEDIPOD_API_VERSION
        ? "This Ailo build is too old for the connected FediPod. Update Ailo."
        : "The connected FediPod is too old for this Ailo build. Update and restart FediPod.",
    );
  }
  if (minAiloApiVersion > AILO_FEDIPOD_API_VERSION) {
    throw new Error("This Ailo build is below FediPod's minimum supported version. Update Ailo.");
  }
  const missing = REQUIRED_FEDIPOD_FEATURES.filter((feature) => !features.includes(feature));
  if (missing.length) {
    throw new Error(
      `The running FediPod is missing required features (${missing.join(", ")}). Update and restart FediPod.`,
    );
  }
  return {
    apiVersion,
    minAiloApiVersion,
    fedipodVersion: fedipodVersion.trim(),
    features,
  };
}
