import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://ledger:ledger@localhost:5432/ledger",
    ESI_CORPORATION_ID: "98000001",
    ESI_CLIENT_ID: "native-client-id",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    ...overrides,
  };
}

describe("loadConfig", () => {
  it("loads a native PKCE configuration without a client secret or pre-issued token", () => {
    const config = loadConfig(environment());

    expect(config.clientId).toBe("native-client-id");
    expect(config.initialRefreshToken).toBeNull();
    expect(config.redirectUri).toBe("http://127.0.0.1:3000/auth/callback");
  });

  it("accepts a valid ESI compatibility date and optional token seed", () => {
    const config = loadConfig(
      environment({
        ESI_COMPATIBILITY_DATE: "2026-11-09",
        ESI_REFRESH_TOKEN: "local-seed",
      }),
    );

    expect(config.compatibilityDate).toBe("2026-11-09");
    expect(config.initialRefreshToken).toBe("local-seed");
  });

  it("rejects malformed compatibility dates and encryption keys", () => {
    expect(() =>
      loadConfig(environment({ ESI_COMPATIBILITY_DATE: "2026-1-9" })),
    ).toThrow("Invalid environment configuration");

    expect(() =>
      loadConfig(
        environment({
          TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
        }),
      ),
    ).toThrow("exactly 32 bytes");
  });
});
