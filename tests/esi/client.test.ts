import { describe, expect, it, vi } from "vitest";
import { EsiClient } from "../../src/esi/client.js";
import type { AppConfig } from "../../src/config/env.js";
import type { EsiTokenProvider } from "../../src/security/esi-token-provider.js";

const config: AppConfig = {
  databaseUrl: "postgresql://ledger:ledger@localhost:5432/ledger",
  corporationId: "98000001",
  clientId: "client-id",
  clientSecret: "client-secret",
  initialRefreshToken: "refresh-token",
  tokenEncryptionKey: Buffer.alloc(32),
  compatibilityDate: "2026-11-09",
  userAgent: "EVE-Ledger-test"
};

function tokenProvider() {
  return {
    getAccessToken: vi.fn().mockResolvedValue("access-token"),
    invalidate: vi.fn()
  } as unknown as EsiTokenProvider & {
    getAccessToken: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };
}

describe("EsiClient", () => {
  it("uses pinned versioned transaction route, division 1 and compatibility headers", async () => {
    const tokens = tokenProvider();
    let requestUrl: URL | undefined;
    let requestHeaders: Headers | undefined;
    const request: typeof fetch = async (input, init) => {
      requestUrl = new URL(String(input));
      requestHeaders = new Headers(init?.headers);
      return new Response('[{"transaction_id":9007199254740993}]', {
        status: 200,
        headers: { "X-Pages": "1", ETag: '"page-one"' }
      });
    };
    const client = new EsiClient(config, tokens, request);

    const response = await client.getTransactions("98000001", "9007199254740994");

    expect(requestUrl?.pathname).toBe(
      "/v1/corporations/98000001/wallets/1/transactions/"
    );
    expect(requestUrl?.searchParams.get("from_id")).toBe("9007199254740994");
    expect(requestUrl?.searchParams.get("datasource")).toBe("tranquility");
    expect(requestHeaders?.get("X-Compatibility-Date")).toBe("2026-11-09");
    expect(requestHeaders?.get("Authorization")).toBe("Bearer access-token");
    expect(response.data[0]).toEqual({ transaction_id: "9007199254740993" });
    expect(response.headers.etag).toBe('"page-one"');
  });

  it("invalidates and refreshes the token once after HTTP 401", async () => {
    const tokens = tokenProvider();
    let requests = 0;
    const request: typeof fetch = async () => {
      requests += 1;
      return requests === 1
        ? new Response("unauthorized", { status: 401 })
        : new Response("[]", { status: 200 });
    };
    const client = new EsiClient(config, tokens, request);

    await client.getJournal("98000001", 1);

    expect(requests).toBe(2);
    expect(tokens.invalidate).toHaveBeenCalledOnce();
  });

  it("retries transient ESI failures with bounded backoff", async () => {
    const tokens = tokenProvider();
    let requests = 0;
    const waits: number[] = [];
    const request: typeof fetch = async () => {
      requests += 1;
      return requests === 1
        ? new Response("temporarily unavailable", { status: 503 })
        : new Response("[]", { status: 200 });
    };
    const client = new EsiClient(config, tokens, request, async (milliseconds) => {
      waits.push(milliseconds);
    });

    await client.getJournal("98000001", 1);

    expect(requests).toBe(2);
    expect(waits).toEqual([1_000]);
  });

  it("rejects malformed X-Pages metadata", async () => {
    const client = new EsiClient(config, tokenProvider(), async () =>
      new Response("[]", { status: 200, headers: { "X-Pages": "not-a-number" } })
    );

    await expect(client.getJournal("98000001", 1)).rejects.toThrow("invalid X-Pages");
  });
});
