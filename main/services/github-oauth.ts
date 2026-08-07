import { OAuthService } from "@glaze/core/oauth";

/** Hosted Glaze GitHub OAuth preset — no client credentials needed. */
export const githubOAuth = OAuthService.github({
  scope: "repo read:user",
});
