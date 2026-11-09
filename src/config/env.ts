import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
  ESI_CORPORATION_ID: z.string().regex(/^[1-9][0-9]*$/),
  ESI_CLIENT_ID: z.string().min(1),
  ESI_REFRESH_TOKEN: z.string().min(1).optional(),
  ESI_REDIRECT_URI: z
    .string()
    .url()
    .default("http://127.0.0.1:3000/auth/callback"),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  ESI_COMPATIBILITY_DATE: z
    .string()
    .regex(/^\\d{4}-\\d{2}-\\d{2}$/)
    .default("2026-11-09"),
  ESI_USER_AGENT: z.string().min(8).default("EVE-Ledger/0.1"),
});

export type AppConfig = {
  databaseUrl: string;
  corporationId: string;
  clientId: string;
  initialRefreshToken: string | null;
  redirectUri: string;
  tokenEncryptionKey: Buffer;
  compatibilityDate: string;
  userAgent: string;
};

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  const key = Buffer.from(parsed.data.TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    corporationId: parsed.data.ESI_CORPORATION_ID,
    clientId: parsed.data.ESI_CLIENT_ID,
    initialRefreshToken: parsed.data.ESI_REFRESH_TOKEN ?? null,
    redirectUri: parsed.data.ESI_REDIRECT_URI,
    tokenEncryptionKey: key,
    compatibilityDate: parsed.data.ESI_COMPATIBILITY_DATE,
    userAgent: parsed.data.ESI_USER_AGENT,
  };
}
