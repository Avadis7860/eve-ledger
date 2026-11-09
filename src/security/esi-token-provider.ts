import type { AppConfig } from "../config/env.js";
import type { RefreshTokenVault } from "./refresh-token-vault.js";
import { EveSsoClient } from "./eve-sso-client.js";

type SsoRefreshClient = Pick<EveSsoClient, "refreshAccessToken">;

export class EsiTokenProvider {
  private cachedAccessToken: string | null = null;
  private expiresAt = 0;
  private refreshInFlight: Promise<string> | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly vault: RefreshTokenVault,
    private readonly sso: SsoRefreshClient = new EveSsoClient(
      config.clientId,
      config.redirectUri,
    ),
    private readonly now: () => number = Date.now,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && this.now() < this.expiresAt - 30_000) {
      return this.cachedAccessToken;
    }

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshAccessToken();
    }
    const pending = this.refreshInFlight;
    try {
      return await pending;
    } finally {
      if (this.refreshInFlight === pending) this.refreshInFlight = null;
    }
  }

  invalidate(): void {
    this.cachedAccessToken = null;
    this.expiresAt = 0;
  }

  private async refreshAccessToken(): Promise<string> {
    const storedRefreshToken = await this.vault.read();
    const refreshToken = storedRefreshToken ?? this.config.initialRefreshToken;
    if (!refreshToken) {
      throw new Error(
        "No EVE SSO refresh token is stored. Run npm run auth:login first.",
      );
    }

    const token = await this.sso.refreshAccessToken(refreshToken);
    const nextRefreshToken = token.refreshToken ?? refreshToken;

    // Persist the initial seed and any rotated token before exposing the access token.
    if (nextRefreshToken !== storedRefreshToken) {
      await this.vault.write(nextRefreshToken);
    }

    this.cachedAccessToken = token.accessToken;
    this.expiresAt = this.now() + token.expiresIn * 1000;
    return token.accessToken;
  }
}
