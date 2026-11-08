import type { AppConfig } from "../config/env.js";
import type { RefreshTokenVault } from "./refresh-token-vault.js";

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
};

export class EsiTokenProvider {
  private cachedAccessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly vault: RefreshTokenVault,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && this.now() < this.expiresAt - 30_000) {
      return this.cachedAccessToken;
    }

    const refreshToken = (await this.vault.read()) ?? this.config.initialRefreshToken;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "esi-wallet.read_corporation_wallets.v1"
    });

    const response = await this.request("https://login.eveonline.com/v2/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${this.config.clientId}:${this.config.clientSecret}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body
    });

    if (!response.ok) {
      throw new Error(`EVE SSO token refresh failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as TokenResponse;
    if (
      typeof payload.access_token !== "string" ||
      payload.token_type !== "Bearer" ||
      !Number.isInteger(payload.expires_in) ||
      payload.expires_in <= 0
    ) {
      throw new Error("EVE SSO returned an invalid token response");
    }

    if (payload.refresh_token && payload.refresh_token !== refreshToken) {
      await this.vault.write(payload.refresh_token);
    }

    this.cachedAccessToken = payload.access_token;
    this.expiresAt = this.now() + payload.expires_in * 1000;
    return payload.access_token;
  }

  invalidate(): void {
    this.cachedAccessToken = null;
    this.expiresAt = 0;
  }
}
