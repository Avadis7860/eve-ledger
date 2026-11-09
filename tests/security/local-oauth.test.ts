import { describe, expect, it, vi } from "vitest";
import {
  authorizeWithLocalCallback,
  completeOAuthCallback,
  validateLoopbackRedirectUri,
} from "../../src/security/local-oauth.js";
import type { EveSsoClient } from "../../src/security/eve-sso-client.js";
import type { RefreshTokenVault } from "../../src/security/refresh-token-vault.js";

const redirectUri = "http://127.0.0.1:38571/auth/callback";
const verifiedToken = {
  accessToken: "verified-access-token",
  refreshToken: "verified-refresh-token",
  expiresIn: 1200,
  characterId: "90000001",
  characterName: "Wallet Character",
  scopes: ["esi-wallet.read_corporation_wallets.v1"],
};

describe("validateLoopbackRedirectUri", () => {
  it("accepts a fixed IPv4 loopback callback", () => {
    expect(validateLoopbackRedirectUri(redirectUri).hostname).toBe("127.0.0.1");
  });

  it.each([
    "https://127.0.0.1:38571/auth/callback",
    "http://localhost:38571/auth/callback",
    "http://192.168.1.20:38571/auth/callback",
    "http://127.0.0.1/auth/callback",
    "http://127.0.0.1:38571/other",
    "http://127.0.0.1:38571/auth/callback?next=https://evil.example",
  ])("rejects non-loopback or non-fixed redirect %s", (uri) => {
    expect(() => validateLoopbackRedirectUri(uri)).toThrow("ESI_REDIRECT_URI");
  });
});

describe("completeOAuthCallback", () => {
  it("checks state, exchanges the code and persists only the verified refresh token", async () => {
    const sso = {
      exchangeAuthorizationCode: vi.fn().mockResolvedValue(verifiedToken),
    } as unknown as Pick<EveSsoClient, "exchangeAuthorizationCode">;
    const vault = {
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pick<RefreshTokenVault, "write">;
    const parameters = new URLSearchParams({
      code: "one-time-code",
      state: "expected-state",
    });

    const identity = await completeOAuthCallback(
      parameters,
      "expected-state",
      "a".repeat(43),
      sso,
      vault,
    );

    expect(sso.exchangeAuthorizationCode).toHaveBeenCalledWith(
      "one-time-code",
      "a".repeat(43),
    );
    expect(vault.write).toHaveBeenCalledWith("verified-refresh-token");
    expect(identity).toEqual({
      characterId: "90000001",
      characterName: "Wallet Character",
      scopes: ["esi-wallet.read_corporation_wallets.v1"],
    });
  });

  it("rejects CSRF state mismatch before exchanging any code", async () => {
    const sso = {
      exchangeAuthorizationCode: vi.fn(),
    } as unknown as Pick<EveSsoClient, "exchangeAuthorizationCode">;
    const vault = {
      write: vi.fn(),
    } as unknown as Pick<RefreshTokenVault, "write">;
    const parameters = new URLSearchParams({
      code: "attacker-code",
      state: "wrong-state",
    });

    await expect(
      completeOAuthCallback(
        parameters,
        "expected-state",
        "a".repeat(43),
        sso,
        vault,
      ),
    ).rejects.toThrow("state validation failed");
    expect(sso.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(vault.write).not.toHaveBeenCalled();
  });

  it("does not store a token if the exchange fails", async () => {
    const sso = {
      exchangeAuthorizationCode: vi.fn().mockRejectedValue(new Error("bad token")),
    } as unknown as Pick<EveSsoClient, "exchangeAuthorizationCode">;
    const vault = {
      write: vi.fn(),
    } as unknown as Pick<RefreshTokenVault, "write">;

    await expect(
      completeOAuthCallback(
        new URLSearchParams({ code: "code", state: "expected-state" }),
        "expected-state",
        "a".repeat(43),
        sso,
        vault,
      ),
    ).rejects.toThrow("bad token");
    expect(vault.write).not.toHaveBeenCalled();
  });
});

describe("authorizeWithLocalCallback", () => {
  it("runs a loopback callback, ignores bad state and persists the verified token", async () => {
    const sso = {
      createAuthorizationRequest: vi.fn().mockResolvedValue({
        url: "https://login.eveonline.com/v2/oauth/authorize?state=expected-state",
        state: "expected-state",
        codeVerifier: "a".repeat(43),
      }),
      exchangeAuthorizationCode: vi.fn().mockResolvedValue(verifiedToken),
    } as unknown as Pick<
      EveSsoClient,
      "createAuthorizationRequest" | "exchangeAuthorizationCode"
    > & {
      createAuthorizationRequest: ReturnType<typeof vi.fn>;
      exchangeAuthorizationCode: ReturnType<typeof vi.fn>;
    };
    const vault = {
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pick<RefreshTokenVault, "write"> & {
      write: ReturnType<typeof vi.fn>;
    };

    const result = await authorizeWithLocalCallback(
      { redirectUri },
      sso,
      vault,
      {
        timeoutMs: 5_000,
        browser: async () => {
          const rejected = await fetch(
            `${redirectUri}?code=attacker-code&state=wrong-state`,
          );
          expect(rejected.status).toBe(400);

          const accepted = await fetch(
            `${redirectUri}?code=one-time-code&state=expected-state`,
          );
          expect(accepted.status).toBe(200);
          expect(accepted.headers.get("Cache-Control")).toBe("no-store");
          const html = await accepted.text();
          expect(html).toContain("Wallet Character");
          expect(html).not.toContain("verified-refresh-token");
        },
      },
    );

    expect(result.characterId).toBe("90000001");
    expect(sso.exchangeAuthorizationCode).toHaveBeenCalledOnce();
    expect(vault.write).toHaveBeenCalledWith("verified-refresh-token");
  });
});
