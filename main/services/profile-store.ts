import type { Profile } from "../types.js";
import { DEFAULT_PROFILE } from "../types.js";
import { JsonStore } from "./json-store.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Accept only http:// or https:// URLs when reading back from disk.
 * Clears anything else so a hand-edited profile.json can't inject
 * data: or javascript: URIs into image sources.
 */
function safeImageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return trimmed;
  } catch {
    // not a valid URL
  }
  return "";
}

function validateProfile(value: unknown): Profile {
  if (!isRecord(value)) throw new Error("profile.json must contain an object");
  return {
    displayName: typeof value.displayName === "string" ? value.displayName : "",
    bio: typeof value.bio === "string" ? value.bio : "",
    avatarUrl: safeImageUrl(value.avatarUrl),
    bannerUrl: safeImageUrl(value.bannerUrl),
    calComPath: typeof value.calComPath === "string" ? value.calComPath : "",
    solidIssuer:
      typeof value.solidIssuer === "string" && value.solidIssuer.length > 0
        ? value.solidIssuer
        : DEFAULT_PROFILE.solidIssuer,
    solidPodRoot: typeof value.solidPodRoot === "string" ? value.solidPodRoot : "",
    githubLogin: optionalString(value.githubLogin),
    githubRepo: optionalString(value.githubRepo),
    solidWebId: optionalString(value.solidWebId),
    fediverseCreatorEnabled:
      typeof value.fediverseCreatorEnabled === "boolean" ? value.fediverseCreatorEnabled : true,
  };
}

class ProfileStore {
  private readonly store = new JsonStore<Profile>(
    "profile.json",
    () => ({ ...DEFAULT_PROFILE }),
    validateProfile,
  );

  async get(): Promise<Profile> {
    return this.store.load();
  }

  async update(patch: Partial<Profile>): Promise<Profile> {
    return this.store.update((current) => ({
      displayName: patch.displayName !== undefined ? patch.displayName : current.displayName,
      bio: patch.bio !== undefined ? patch.bio : current.bio,
      avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : current.avatarUrl,
      bannerUrl: patch.bannerUrl !== undefined ? patch.bannerUrl : current.bannerUrl,
      calComPath: patch.calComPath !== undefined ? patch.calComPath : current.calComPath,
      solidIssuer: patch.solidIssuer !== undefined ? patch.solidIssuer : current.solidIssuer,
      solidPodRoot: patch.solidPodRoot !== undefined ? patch.solidPodRoot : current.solidPodRoot,
      githubLogin: patch.githubLogin !== undefined ? patch.githubLogin : current.githubLogin,
      githubRepo: patch.githubRepo !== undefined ? patch.githubRepo : current.githubRepo,
      solidWebId: patch.solidWebId !== undefined ? patch.solidWebId : current.solidWebId,
      fediverseCreatorEnabled:
        patch.fediverseCreatorEnabled !== undefined
          ? patch.fediverseCreatorEnabled
          : current.fediverseCreatorEnabled,
    }));
  }
}

export const profileStore = new ProfileStore();
