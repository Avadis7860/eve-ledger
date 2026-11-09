import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CORPORATION_WALLET_SCOPE,
  EveSsoClient,
} from "../../src/security/eve-sso-client.js";

const CLIENT_ID = "native-client-id";
const REDIRECT_URI = "http://127.0.0.1:3000/auth/callback";
const NOW = 1_800_000_000_000;

function createFixture(scope = CORPORATION_WALLET_SCOPE, audience = [CLIENT_ID, "EVE Online"]) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const exported = publicKey.export({ format: "jwk" }) as unknown as Record<
    string,
    unknown
  >;
  const jwk = {
    ...exported,
    kid: "test-rsa-key",
    alg: "RS256",
    use: "sig",
  };

  const claims = {
    iss: "https://login.eveonline.com/",
    aud: audience,
    exp: Math.floor(NOW / 1000) + 3600,
    sub: "CHARACTER:EVE:90000001",
    name: "Wallet Character",
    scp: [scope],
  };
  const header = { alg: "RS256", kid: "test-rsa-key", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedClaims}`),
    privateKey,
  ).toString("base64url");
  const accessToken = `${encodedHeader}.${encodedClaims}.${signature}`;

  let tokenBody = "";
  let tokenAuthorization: string | null = null;
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return new Response(
        JSON.stringify({
          authorization_endpoint: "https://login.eveonline.com/v2/oauth/authorize",
          token_endpoint: "https://login.eveonline.com/v2/oauth/token",
          jwks_uri: "https://login.eveonline.com/oauth/jwks",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.pathname === "/oauth/jwks") {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/v2/oauth/token") {
      tokenBody = String(init?.body);
      tokenAuthorization = new Headers(init?.headers).get("Authorization");
      return new Response(
        JSON.stringify({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 1200,
          refresh_token: "rotated-refresh-token",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };

  return {
    accessToken,
    claims,
    request,
    getTokenBody: () => tokenBody,
    getTokenAuthorization: () => tokenAuthorization,
  };
}

describe("EveSsoClient", () => {
  it("builds an S256 PKCE request with a cryptographically random state and verifier", async () => {
    const fixture = createFixture();
    const sso = new EveSsoClient(CLIENT_ID, REDIRECT_URI, fixture.request, () => NOW);

    const authorization = await sso.createAuthorizationRequest();
    const url = new URL(authorization.url);
    const expectedChallenge = createHash("sha256")
      .update(authorization.codeVerifier)
      .digest("base64url");

    expect(url.origin).toBe("https://login.eveonline.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe(CORPORATION_WALLET_SCOPE);
    expect(url.searchParams.get("state")).toBe(authorization.state);
    expect(url.searchParams.get("code_challenge")).toBe(expectedChallenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.state.length).toBeGreaterThanOrEqual(40);
  });

  it("exchanges authorization codes without a client secret and verifies the JWT", async () => {
    const fixture = createFixture();
    const sso = new EveSsoClient(CLIENT_ID, REDIRECT_URI, fixture.request, () => NOW);

    const result = await sso.exchangeAuthorizationCode(
      "one-time-code",
      "a".repeat(43),
    );

    const body = new URLSearchParams(fixture.getTokenBody());
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("one-time-code");
    expect(body.get("client_id")).toBe(CLIENT_ID);
    expect(body.get("code_verifier")).toBe("a".repeat(43));
    expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(fixture.getTokenAuthorization()).toBeNull();
    expect(result.characterId).toBe("90000001");
    expect(result.characterName).toBe("Wallet Character");
    expect(result.scopes).toContain(CORPORATION_WALLET_SCOPE);
    expect(result.refreshToken).toBe("rotated-refresh-token");
  });

  it("uses the native refresh-token form contract", async () => {
    const fixture = createFixture();
    const sso = new EveSsoClient(CLIENT_ID, REDIRECT_URI, fixture.request, () => NOW);

    await sso.refreshAccessToken("existing-refresh-token");

    const body = new URLSearchParams(fixture.getTokenBody());
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("existing-refresh-token");
    expect(body.get("client_id")).toBe(CLIENT_ID);
    expect(body.get("scope")).toBe(CORPORATION_WALLET_SCOPE);
    expect(fixture.getTokenAuthorization()).toBeNull();
  });

  it("rejects tokens that do not grant the corporation wallet scope", async () => {
    const fixture = createFixture("esi-wallet.read_character_wallet.v1");
    const sso = new EveSsoClient(CLIENT_ID, REDIRECT_URI, fixture.request, () => NOW);

    await expect(
      sso.exchangeAuthorizationCode("code", "a".repeat(43)),
    ).rejects.toThrow("did not grant");
  });

  it("rejects a token with an audience for another application", async () => {
    const fixture = createFixture(CORPORATION_WALLET_SCOPE, ["another-client", "EVE Online"]);
    const sso = new EveSsoClient(CLIENT_ID, REDIRECT_URI, fixture.request, () => NOW);

    await expect(
      sso.exchangeAuthorizationCode("code", "a".repeat(43)),
    ).rejects.toThrow("another application");
  });
});
