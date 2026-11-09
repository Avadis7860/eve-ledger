import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
} from "node:crypto";

const METADATA_URL =
  "https://login.eveonline.com/.well-known/oauth-authorization-server";
export const CORPORATION_WALLET_SCOPE =
  "esi-wallet.read_corporation_wallets.v1";
const METADATA_CACHE_MS = 5 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 30;
const ACCEPTED_ISSUERS = new Set([
  "https://login.eveonline.com/",
  "https://login.eveonline.com",
  "login.eveonline.com",
]);

type JsonObject = Record<string, unknown>;

type SsoMetadata = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
};

type SsoJwk = {
  kty: string;
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
};

export type VerifiedEveToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  characterId: string;
  characterName: string;
  scopes: string[];
};

export type AuthorizationRequest = {
  url: string;
  state: string;
  codeVerifier: string;
};

function record(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`EVE SSO ${label} must be an object`);
  }
  return value as JsonObject;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`EVE SSO ${label} is missing or invalid`);
  }
  return value;
}

function trustedSsoUrl(value: unknown, label: string): string {
  const raw = nonEmptyString(value, label);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`EVE SSO ${label} is not a valid URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "login.eveonline.com" ||
    url.username ||
    url.password
  ) {
    throw new Error(`EVE SSO ${label} is not on the trusted EVE SSO origin`);
  }
  return url.toString();
}

function decodeJsonSegment(segment: string, label: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    );
    return record(parsed, label);
  } catch {
    throw new Error(`EVE SSO token has an invalid ${label}`);
  }
}

export class EveSsoClient {
  private metadataCache: {
    value: SsoMetadata;
    expiresAt: number;
  } | null = null;

  private jwksCache: {
    keys: SsoJwk[];
    expiresAt: number;
  } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly redirectUri: string,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    if (!clientId.trim()) throw new Error("ESI_CLIENT_ID is required");
  }

  async createAuthorizationRequest(): Promise<AuthorizationRequest> {
    const metadata = await this.getMetadata();
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const url = new URL(metadata.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("scope", CORPORATION_WALLET_SCOPE);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return { url: url.toString(), state, codeVerifier };
  }

  async exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
  ): Promise<VerifiedEveToken> {
    if (!code || code.length > 2048) {
      throw new Error("EVE SSO returned an invalid authorization code");
    }
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
      throw new Error("The local PKCE verifier is invalid");
    }

    const metadata = await this.getMetadata();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code_verifier: codeVerifier,
    });
    const token = await this.requestToken(metadata.tokenEndpoint, body);
    if (!token.refreshToken) {
      throw new Error("EVE SSO did not return a refresh token");
    }
    return token;
  }

  async refreshAccessToken(refreshToken: string): Promise<VerifiedEveToken> {
    if (!refreshToken) throw new Error("No EVE SSO refresh token is available");
    const metadata = await this.getMetadata();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
      scope: CORPORATION_WALLET_SCOPE,
    });
    return this.requestToken(metadata.tokenEndpoint, body);
  }

  private async requestToken(
    endpoint: string,
    body: URLSearchParams,
  ): Promise<VerifiedEveToken> {
    const response = await this.request(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    if (!response.ok) {
      throw new Error(
        `EVE SSO token request failed with HTTP ${response.status}`,
      );
    }

    const payload = record(await response.json(), "token response");
    const accessToken = nonEmptyString(payload.access_token, "access token");
    if (
      payload.token_type !== "Bearer" ||
      typeof payload.expires_in !== "number" ||
      !Number.isInteger(payload.expires_in) ||
      payload.expires_in <= 0
    ) {
      throw new Error("EVE SSO returned an invalid token response");
    }
    const refreshToken =
      typeof payload.refresh_token === "string" &&
      payload.refresh_token.length > 0
        ? payload.refresh_token
        : null;
    const claims = await this.verifyAccessToken(accessToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: payload.expires_in,
      characterId: claims.characterId,
      characterName: claims.characterName,
      scopes: claims.scopes,
    };
  }

  private async verifyAccessToken(
    token: string,
  ): Promise<{
    characterId: string;
    characterName: string;
    scopes: string[];
  }> {
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      throw new Error("EVE SSO returned a malformed access token");
    }
    const [encodedHeader, encodedClaims, encodedSignature] = parts;
    if (!encodedHeader || !encodedClaims || !encodedSignature) {
      throw new Error("EVE SSO returned a malformed access token");
    }

    const header = decodeJsonSegment(encodedHeader, "JWT header");
    if (header.alg !== "RS256" || typeof header.kid !== "string") {
      throw new Error("EVE SSO access token uses an unsupported signature");
    }

    let jwk = await this.findSigningKey(header.kid, false);
    if (!jwk) {
      jwk = await this.findSigningKey(header.kid, true);
    }
    if (!jwk) {
      throw new Error("EVE SSO signing key was not found in its JWKS");
    }

    const publicKey = createPublicKey({
      key: jwk as never,
      format: "jwk",
    });
    const signedContent = Buffer.from(
      `${encodedHeader}.${encodedClaims}`,
      "ascii",
    );
    const signature = Buffer.from(encodedSignature, "base64url");
    if (
      !verifySignature("RSA-SHA256", signedContent, publicKey, signature)
    ) {
      throw new Error("EVE SSO access-token signature verification failed");
    }

    const claims = decodeJsonSegment(encodedClaims, "JWT claims");
    const issuer = claims.iss;
    if (
      typeof issuer !== "string" ||
      (!ACCEPTED_ISSUERS.has(issuer) &&
        issuer !== "https://login.eveonline.com/")
    ) {
      throw new Error("EVE SSO access token has an unexpected issuer");
    }

    const audience = claims.aud;
    if (
      !Array.isArray(audience) ||
      !audience.includes(this.clientId) ||
      !audience.includes("EVE Online")
    ) {
      throw new Error("EVE SSO access token was issued for another application");
    }

    const nowSeconds = Math.floor(this.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
      throw new Error("EVE SSO access token is expired or has no expiry");
    }
    if (
      typeof claims.nbf === "number" &&
      claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS
    ) {
      throw new Error("EVE SSO access token is not active yet");
    }

    const subject = claims.sub;
    if (typeof subject !== "string") {
      throw new Error("EVE SSO access token has no character subject");
    }
    const subjectMatch = /^CHARACTER:EVE:([1-9][0-9]*)$/.exec(subject);
    if (!subjectMatch?.[1]) {
      throw new Error("EVE SSO access token has an invalid character subject");
    }

    const characterName = nonEmptyString(claims.name, "character name");
    const scopes = claims.scp;
    if (
      !Array.isArray(scopes) ||
      !scopes.every((scope) => typeof scope === "string")
    ) {
      throw new Error("EVE SSO access token has invalid scope claims");
    }
    if (!scopes.includes(CORPORATION_WALLET_SCOPE)) {
      throw new Error(
        `The authorized EVE character did not grant ${CORPORATION_WALLET_SCOPE}`,
      );
    }

    return {
      characterId: subjectMatch[1],
      characterName,
      scopes,
    };
  }

  private async findSigningKey(
    keyId: string,
    forceRefresh: boolean,
  ): Promise<SsoJwk | null> {
    const keys = await this.getJwks(forceRefresh);
    return (
      keys.find(
        (key) =>
          key.kid === keyId &&
          key.kty === "RSA" &&
          (key.alg === undefined || key.alg === "RS256") &&
          (key.use === undefined || key.use === "sig"),
      ) ?? null
    );
  }

  private async getMetadata(): Promise<SsoMetadata> {
    if (
      this.metadataCache &&
      this.metadataCache.expiresAt > this.now()
    ) {
      return this.metadataCache.value;
    }

    const payload = record(
      await this.getJson(METADATA_URL),
      "authorization metadata",
    );
    const value: SsoMetadata = {
      authorizationEndpoint: trustedSsoUrl(
        payload.authorization_endpoint,
        "authorization endpoint",
      ),
      tokenEndpoint: trustedSsoUrl(payload.token_endpoint, "token endpoint"),
      jwksUri: trustedSsoUrl(payload.jwks_uri, "JWKS URI"),
    };
    this.metadataCache = {
      value,
      expiresAt: this.now() + METADATA_CACHE_MS,
    };
    return value;
  }

  private async getJwks(forceRefresh: boolean): Promise<SsoJwk[]> {
    if (
      !forceRefresh &&
      this.jwksCache &&
      this.jwksCache.expiresAt > this.now()
    ) {
      return this.jwksCache.keys;
    }

    const metadata = await this.getMetadata();
    const payload = record(await this.getJson(metadata.jwksUri), "JWKS");
    if (!Array.isArray(payload.keys)) {
      throw new Error("EVE SSO JWKS response has no keys array");
    }

    const keys: SsoJwk[] = payload.keys.map((value) => {
      const key = record(value, "JWKS key");
      return {
        kty: nonEmptyString(key.kty, "JWK key type"),
        kid: nonEmptyString(key.kid, "JWK key ID"),
        n: nonEmptyString(key.n, "JWK modulus"),
        e: nonEmptyString(key.e, "JWK exponent"),
        ...(typeof key.alg === "string" ? { alg: key.alg } : {}),
        ...(typeof key.use === "string" ? { use: key.use } : {}),
      };
    });
    this.jwksCache = {
      keys,
      expiresAt: this.now() + METADATA_CACHE_MS,
    };
    return keys;
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await this.request(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`EVE SSO discovery failed with HTTP ${response.status}`);
    }
    return response.json();
  }
}
