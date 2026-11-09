import { describe, expect, it, vi } from "vitest";
import { EsiTokenProvider } from "../../src/security/esi-token-provider.js";
import type { AppConfig } from "../../src/config/env.js";
import type { RefreshTokenVault } from "../../src/security/refresh-token-vault.js";
import type { EveSsoClient } from "../../src/security/eve-sso-client.js";

const config: AppConfig = {
  databaseUrl: "postgresql://ledger:ledger@localhost:5432/ledger",
  corporationId: "98000001",
  clientId: "client-id",
  initialRefreshToken: "initial-refresh",
  redirectUri: "http://127.0.0.1:3000/auth/callback",
  tokenEncryptionKey: Buffer.alloc(32),
  compatibilityDate: "2026-11-09",
  userAgent: "EVE-Ledger-test",
};

function token(refreshToken: string | null = "rotated-refresh") {
  return {
    accessToken: "access-one",
    refreshToken,
    expiresIn: 1200,
    characterId: "90000001",
    characterName: "Test Character",
    scopes: ["esi-wallet.read_corporation_wallets.v1"],
  };
}

function refreshClient() {
  return {
    refreshAccessToken: vi.fn().mockResolvedValue(token()),
  } as unknown as Pick<EveSsoClient, "refreshAccessToken"> & {
    refreshAccessToken: ReturnType<typeof vi.fn>;
  };
}

describe("EsiTokenProvider", () => {
  it("uses the native SSO refresh contract and persists rotated refresh tokens", async () => {
    const vault = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as RefreshTokenVault & {
      read: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
    };
    const sso = refreshClient();
    const provider = new EsiTokenProvider(config, vault, sso, () => 1_000);

    await expect(provider.getAccessToken()).resolves.toBe("access-one");

    expect(sso.refreshAccessToken).toHaveBeenCalledWith("initial-refresh");
    expect(vault.write).toHaveBeenCalledWith("rotated-refresh");
  });

  it("reuses the cached access token until it approaches expiry", async () => {
    const vault = {
      read: vi.fn().mockResolvedValue("stored-refresh"),
      write: vi.fn(),
    } as unknown as RefreshTokenVault & {
      read: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
    };
    const sso = refreshClient();
    const provider = new EsiTokenProvider(config, vault, sso, () => 1_000);

    await provider.getAccessToken();
    await provider.getAccessToken();

    expect(sso.refreshAccessToken).toHaveBeenCalledOnce();
    expect(vault.write).toHaveBeenCalledWith("rotated-refresh");
  });

  it("serializes concurrent refresh attempts into one SSO request", async () => {
    const vault = {
      read: vi.fn().mockResolvedValue("stored-refresh"),
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as RefreshTokenVault & {
      read: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
    };
    const sso = refreshClient();
    const provider = new EsiTokenProvider(config, vault, sso, () => 1_000);

    const tokens = await Promise.all([
      provider.getAccessToken(),
      provider.getAccessToken(),
      provider.getAccessToken(),
    ]);

    expect(tokens).toEqual(["access-one", "access-one", "access-one"]);
    expect(sso.refreshAccessToken).toHaveBeenCalledOnce();
  });

  it("fails with an actionable message when no local authorization exists", async () => {
    const vault = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn(),
    } as unknown as RefreshTokenVault;
    const sso = refreshClient();
    const noSeedConfig = { ...config, initialRefreshToken: null };
    const provider = new EsiTokenProvider(noSeedConfig, vault, sso);

    await expect(provider.getAccessToken()).rejects.toThrow(
      "Run npm run auth:login first",
    );
    expect(sso.refreshAccessToken).not.toHaveBeenCalled();
  });
});
