import { describe, expect, it, vi } from "vitest";
import { EsiTokenProvider } from "../../src/security/esi-token-provider.js";
import type { AppConfig } from "../../src/config/env.js";
import type { RefreshTokenVault } from "../../src/security/refresh-token-vault.js";

const config: AppConfig = {
  databaseUrl: "postgresql://ledger:ledger@localhost:5432/ledger",
  corporationId: "98000001",
  clientId: "client-id",
  clientSecret: "client-secret",
  initialRefreshToken: "initial-refresh",
  tokenEncryptionKey: Buffer.alloc(32),
  compatibilityDate: "2026-11-09",
  userAgent: "EVE-Ledger-test"
};

describe("EsiTokenProvider", () => {
  it("requests only the corporation wallet scope and persists rotated refresh tokens", async () => {
    const vault = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(undefined)
    } as unknown as RefreshTokenVault;
    let requestBody = "";
    let authorization = "";
    const request: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body);
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(
        JSON.stringify({
          access_token: "access-one",
          token_type: "Bearer",
          expires_in: 1200,
          refresh_token: "rotated-refresh"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const provider = new EsiTokenProvider(config, vault, request, () => 1_000);

    await expect(provider.getAccessToken()).resolves.toBe("access-one");
    expect(requestBody).toContain("scope=esi-wallet.read_corporation_wallets.v1");
    expect(requestBody).toContain("refresh_token=initial-refresh");
    expect(authorization.startsWith("Basic ")).toBe(true);
    expect(vault.write).toHaveBeenCalledWith("rotated-refresh");
  });

  it("reuses the cached access token until it approaches expiry", async () => {
    const vault = { read: vi.fn().mockResolvedValue("refresh") } as unknown as RefreshTokenVault;
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-cached",
          token_type: "Bearer",
          expires_in: 1200
        }),
        { status: 200 }
      )
    );
    const provider = new EsiTokenProvider(config, vault, request, () => 1_000);

    await provider.getAccessToken();
    await provider.getAccessToken();

    expect(request).toHaveBeenCalledOnce();
  });

  it("rejects an unsuccessful SSO refresh without exposing credentials", async () => {
    const vault = { read: vi.fn().mockResolvedValue(null) } as unknown as RefreshTokenVault;
    const provider = new EsiTokenProvider(
      config,
      vault,
      async () => new Response("denied", { status: 400 })
    );

    await expect(provider.getAccessToken()).rejects.toThrow(
      "EVE SSO token refresh failed with HTTP 400"
    );
  });
});
