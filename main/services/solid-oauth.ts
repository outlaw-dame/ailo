import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash, randomBytes } from "node:crypto";

import {
  exportJWK,
  generateKeyPair,
  importJWK,
  SignJWT,
  type JWK,
  type KeyLike,
} from "jose";

import { app, logger, safeStorage } from "@glaze/core/backend";
import { PKCEClient } from "@glaze/core/oauth";

import type { SolidSessionSnapshot } from "../types.js";
import { profileStore } from "./profile-store.js";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

interface OidcConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  end_session_endpoint?: string;
  jwks_uri?: string;
  dpop_signing_alg_values_supported?: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function webIdFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as Record<
      string,
      unknown
    >;
    if (typeof payload.webid === "string") return payload.webid;
    if (typeof payload.sub === "string" && payload.sub.startsWith("http")) return payload.sub;
    return null;
  } catch {
    return null;
  }
}

class SolidOAuthService {
  private session: SolidSessionSnapshot | null = null;
  private sessionPath: string | null = null;
  private dpopPrivateKey: KeyLike | Uint8Array | null = null;
  private dpopPublicJwk: JWK | null = null;
  private loadPromise: Promise<void> | null = null;

  private async resolvePath(): Promise<string> {
    if (!this.sessionPath) {
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      this.sessionPath = path.join(dir, "solid-session.bin");
    }
    return this.sessionPath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const encrypted = await fs.readFile(await this.resolvePath());
        const json = await safeStorage.decryptString(encrypted);
        const parsed: unknown = JSON.parse(json);
        if (!isRecord(parsed)) return;
        this.session = parsed as unknown as SolidSessionSnapshot;
        if (this.session.dpopPrivateJwk) {
          this.dpopPrivateKey = (await importJWK(
            this.session.dpopPrivateJwk as unknown as JWK,
            "ES256",
          )) as KeyLike;
          this.dpopPublicJwk = this.session.dpopPublicJwk as unknown as JWK;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        ) {
          return;
        }
        logger.warn("solid", `Failed to load Solid session: ${String(error)}`);
      }
    })();
    return this.loadPromise;
  }

  private async persist(): Promise<void> {
    if (!this.session) {
      await fs.rm(await this.resolvePath(), { force: true });
      return;
    }
    const encrypted = await safeStorage.encryptString(JSON.stringify(this.session));
    await fs.writeFile(await this.resolvePath(), encrypted);
  }

  private async fetchOidcConfig(issuer: string): Promise<OidcConfig> {
    const base = issuer.replace(/\/+$/, "");
    const url = `${base}/.well-known/openid-configuration`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Solid OIDC discovery failed (${response.status}) for ${url}`);
    }
    const data = (await response.json()) as OidcConfig;
    if (!data.authorization_endpoint || !data.token_endpoint) {
      throw new Error("Solid OIDC config missing authorization or token endpoint");
    }
    return data;
  }

  private async ensureDpopKeys(): Promise<void> {
    if (this.dpopPrivateKey && this.dpopPublicJwk) return;
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    this.dpopPrivateKey = privateKey;
    this.dpopPublicJwk = await exportJWK(publicKey);
    this.dpopPublicJwk.alg = "ES256";
    this.dpopPublicJwk.use = "sig";
  }

  private async createDpopProof(method: string, url: string, accessToken?: string): Promise<string> {
    await this.ensureDpopKeys();
    if (!this.dpopPrivateKey || !this.dpopPublicJwk) {
      throw new Error("DPoP keys are not available");
    }
    const jti = base64Url(randomBytes(16));
    const payload: Record<string, unknown> = {
      htm: method.toUpperCase(),
      htu: url.split("?")[0],
      iat: Math.floor(Date.now() / 1000),
      jti,
    };
    if (accessToken) {
      const hash = createHash("sha256").update(accessToken).digest();
      payload.ath = base64Url(hash);
    }
    return new SignJWT(payload)
      .setProtectedHeader({
        alg: "ES256",
        typ: "dpop+jwt",
        jwk: this.dpopPublicJwk,
      })
      .sign(this.dpopPrivateKey);
  }

  private async dynamicRegister(
    config: OidcConfig,
    redirectUri: string,
  ): Promise<{ client_id: string }> {
    if (!config.registration_endpoint) {
      throw new Error(
        "This Solid identity provider does not support dynamic client registration. Try https://login.inrupt.com",
      );
    }
    const response = await fetch(config.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Knot",
        application_type: "native",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        dpop_bound_access_tokens: true,
        id_token_signed_response_alg: "ES256",
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Solid client registration failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`,
      );
    }
    const data = (await response.json()) as { client_id?: string };
    if (!data.client_id) throw new Error("Solid registration response missing client_id");
    return { client_id: data.client_id };
  }

  private async exchangeToken(
    tokenEndpoint: string,
    body: URLSearchParams,
  ): Promise<TokenResponse> {
    const dpop = await this.createDpopProof("POST", tokenEndpoint);
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        DPoP: dpop,
      },
      body,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Solid token exchange failed (${response.status})${text ? `: ${text.slice(0, 280)}` : ""}`,
      );
    }
    return (await response.json()) as TokenResponse;
  }

  async authorize(issuerInput?: string): Promise<{ webId: string; issuer: string }> {
    await this.ensureLoaded();
    const profile = await profileStore.get();
    const issuer = (issuerInput || profile.solidIssuer || "https://login.inrupt.com").replace(
      /\/+$/,
      "",
    );

    const config = await this.fetchOidcConfig(issuer);
    await this.ensureDpopKeys();

    // Glaze's hosted OAuth relay always uses this browser redirect URI.
    const redirectUri = "https://www.glaze.app/api/oauth/callback";
    const registration = await this.dynamicRegister(config, redirectUri);
    const clientId = registration.client_id;

    const pkce = new PKCEClient();
    const authRequest = await pkce.authorizationRequest({
      authorizeUrl: config.authorization_endpoint,
      clientId,
      scopes: ["openid", "profile", "offline_access", "webid"],
      extraParameters: {
        prompt: "consent",
      },
    });

    logger.info("solid", `Opening Solid OIDC authorize for ${issuer}`);
    const result = await pkce.authorize(authRequest);

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code: result.code,
      redirect_uri: authRequest.redirectUri,
      client_id: clientId,
      code_verifier: authRequest.codeVerifier,
    });
    const tokens = await this.exchangeToken(config.token_endpoint, tokenBody);
    const webId = webIdFromIdToken(tokens.id_token) ?? "";
    if (!webId) {
      throw new Error("Solid login succeeded but no WebID was returned in the ID token");
    }

    const privateJwk = await exportJWK(this.dpopPrivateKey as KeyLike);
    this.session = {
      webId,
      issuer,
      clientId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      idToken: tokens.id_token ?? null,
      expiresAt: Date.now() + (tokens.expires_in ?? 300) * 1000,
      dpopPrivateJwk: privateJwk as unknown as Record<string, unknown>,
      dpopPublicJwk: this.dpopPublicJwk as unknown as Record<string, unknown>,
      tokenEndpoint: config.token_endpoint,
      authorizationEndpoint: config.authorization_endpoint,
      registrationEndpoint: config.registration_endpoint ?? null,
      endSessionEndpoint: config.end_session_endpoint ?? null,
    };
    await this.persist();
    await profileStore.update({
      solidWebId: webId,
      solidIssuer: issuer,
    });
    return { webId, issuer };
  }

  async disconnect(): Promise<void> {
    await this.ensureLoaded();
    this.session = null;
    this.dpopPrivateKey = null;
    this.dpopPublicJwk = null;
    await this.persist();
    await profileStore.update({ solidWebId: null });
  }

  async getSession(): Promise<{ connected: boolean; webId: string | null; issuer: string | null }> {
    await this.ensureLoaded();
    if (!this.session) return { connected: false, webId: null, issuer: null };
    return {
      connected: true,
      webId: this.session.webId,
      issuer: this.session.issuer,
    };
  }

  private async refreshIfNeeded(): Promise<SolidSessionSnapshot> {
    await this.ensureLoaded();
    if (!this.session) throw new Error("Solid is not connected. Connect your Pod in Profile.");
    if (Date.now() < this.session.expiresAt - 30_000) return this.session;
    if (!this.session.refreshToken) {
      throw new Error("Solid session expired. Please reconnect your Pod.");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.session.refreshToken,
      client_id: this.session.clientId,
    });
    const tokens = await this.exchangeToken(this.session.tokenEndpoint, body);
    this.session = {
      ...this.session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? this.session.refreshToken,
      idToken: tokens.id_token ?? this.session.idToken,
      expiresAt: Date.now() + (tokens.expires_in ?? 300) * 1000,
    };
    await this.persist();
    return this.session;
  }

  async authorizedFetch(url: string, init: FetchInit = {}): Promise<Response> {
    const session = await this.refreshIfNeeded();
    const method = (init.method ?? "GET").toUpperCase();
    const dpop = await this.createDpopProof(method, url, session.accessToken);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `DPoP ${session.accessToken}`);
    headers.set("DPoP", dpop);
    return fetch(url, { ...init, headers, method });
  }

  getWebId(): string | null {
    return this.session?.webId ?? null;
  }
}

export const solidOAuth = new SolidOAuthService();
