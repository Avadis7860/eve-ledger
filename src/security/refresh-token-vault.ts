import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Pool } from "pg";

const TOKEN_NAME = "esi_refresh_token";

export class RefreshTokenVault {
  constructor(
    private readonly pool: Pool,
    private readonly encryptionKey: Buffer,
  ) {
    if (encryptionKey.length !== 32) {
      throw new Error("Refresh-token vault requires a 32-byte encryption key");
    }
  }

  async read(): Promise<string | null> {
    const result = await this.pool.query<{
      ciphertext: Buffer;
      nonce: Buffer;
      auth_tag: Buffer;
    }>(
      "SELECT ciphertext, nonce, auth_tag FROM secure_tokens WHERE token_name = $1",
      [TOKEN_NAME],
    );
    const row = result.rows[0];
    if (!row) return null;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      row.nonce,
    );
    decipher.setAuthTag(row.auth_tag);
    return Buffer.concat([
      decipher.update(row.ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }

  async write(token: string): Promise<void> {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    await this.pool.query(
      `INSERT INTO secure_tokens (token_name, ciphertext, nonce, auth_tag)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_name) DO UPDATE SET
         ciphertext = EXCLUDED.ciphertext,
         nonce = EXCLUDED.nonce,
         auth_tag = EXCLUDED.auth_tag,
         updated_at = now()`,
      [TOKEN_NAME, ciphertext, nonce, authTag],
    );
  }
}
