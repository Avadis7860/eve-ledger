import "dotenv/config";
import { loadConfig } from "../config/env.js";
import { createPool } from "../db/pool.js";
import { EveSsoClient } from "../security/eve-sso-client.js";
import { authorizeWithLocalCallback } from "../security/local-oauth.js";
import { RefreshTokenVault } from "../security/refresh-token-vault.js";

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);

try {
  const vault = new RefreshTokenVault(pool, config.tokenEncryptionKey);
  const sso = new EveSsoClient(config.clientId, config.redirectUri);
  process.stdout.write(
    "Opening EVE SSO authorization for the corporation wallet read scope...\n",
  );

  const identity = await authorizeWithLocalCallback(config, sso, vault);

  process.stdout.write(
    `Authorization saved for ${identity.characterName} (character ${identity.characterId}).\n`,
  );
  process.stdout.write(
    "The refresh token is encrypted in PostgreSQL. You can now run npm run sync:wallet.\n",
  );
} catch (error) {
  process.stderr.write(
    `EVE SSO authorization failed: ${error instanceof Error ? error.message : "Unknown error"}\n`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
