import type { AppConfig } from "../config/env.js";
import type { EsiTokenProvider } from "../security/esi-token-provider.js";
import { parseEsiJson } from "./json.js";
import type { EsiResponse } from "./contracts.js";

const ESI_BASE_URL = "https://esi.evetech.net";

export class EsiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string
  ) {
    super(message);
    this.name = "EsiHttpError";
  }
}

type RequestOptions = {
  query?: Record<string, string>;
  page?: number;
  cursor?: string | null;
  maxAttempts?: number;
};

export class EsiClient {
  constructor(
    private readonly config: AppConfig,
    private readonly tokens: EsiTokenProvider,
    private readonly request: typeof fetch = fetch,
    private readonly sleep: (milliseconds: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  async get<T>(path: string, options: RequestOptions = {}): Promise<EsiResponse<T>> {
    const url = new URL(path, ESI_BASE_URL);
    url.searchParams.set("datasource", "tranquility");
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }
    if (options.page !== undefined) url.searchParams.set("page", String(options.page));
    if (options.cursor !== undefined && options.cursor !== null) {
      url.searchParams.set("from_id", options.cursor);
    }

    const maxAttempts = options.maxAttempts ?? 4;
    let refreshedAfterUnauthorized = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const token = await this.tokens.getAccessToken();
      const response = await this.request(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": this.config.userAgent,
          "X-Compatibility-Date": this.config.compatibilityDate
        }
      });

      if (response.status === 401 && !refreshedAfterUnauthorized) {
        await response.body?.cancel();
        this.tokens.invalidate();
        refreshedAfterUnauthorized = true;
        continue;
      }

      if (response.ok) {
        const rawBody = await response.text();
        const xPagesHeader = response.headers.get("X-Pages");
        const xPages = xPagesHeader === null ? null : Number(xPagesHeader);
        if (xPagesHeader !== null && (!Number.isInteger(xPages) || Number(xPages) < 1)) {
          throw new EsiHttpError("ESI returned an invalid X-Pages header", response.status, path);
        }

        return {
          data: parseEsiJson<T>(rawBody),
          rawBody,
          status: response.status,
          retrievedAt: new Date(),
          headers: {
            etag: response.headers.get("ETag"),
            lastModified: response.headers.get("Last-Modified"),
            expires: response.headers.get("Expires"),
            xPages,
            errorLimitRemain: response.headers.get("X-Esi-Error-Limit-Remain"),
            errorLimitReset: response.headers.get("X-Esi-Error-Limit-Reset")
          }
        };
      }

      const retryable = [420, 429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === maxAttempts) {
        throw new EsiHttpError(
          `ESI request failed with HTTP ${response.status}`,
          response.status,
          path
        );
      }

      const retryAfter = Number(response.headers.get("Retry-After"));
      const errorLimitReset = Number(response.headers.get("X-Esi-Error-Limit-Reset"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : response.status === 420 && Number.isFinite(errorLimitReset) && errorLimitReset > 0
            ? (errorLimitReset + 1) * 1000
            : Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      await response.body?.cancel();
      await this.sleep(wait);
    }

    throw new EsiHttpError("ESI retry policy exhausted", 0, path);
  }

  getTransactions(corporationId: string, fromId?: string) {
    return this.get<unknown[]>(
      `/v1/corporations/${corporationId}/wallets/1/transactions/`,
      fromId === undefined ? {} : { cursor: fromId }
    );
  }

  getJournal(corporationId: string, page: number) {
    return this.get<unknown[]>(
      `/v4/corporations/${corporationId}/wallets/1/journal/`,
      { page }
    );
  }

  getWallets(corporationId: string) {
    return this.get<unknown[]>(`/v1/corporations/${corporationId}/wallets/`);
  }
}
