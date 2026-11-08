import "dotenv/config";
import { loadConfig } from "../config/env.js";
import { createPool } from "../db/pool.js";
import { EsiClient } from "../esi/client.js";
import { EsiTokenProvider } from "../security/esi-token-provider.js";
import { RefreshTokenVault } from "../security/refresh-token-vault.js";
import { PostgresWalletStore } from "../persistence/postgres-wallet-store.js";
import { syncWalletDivision1 } from "../ingestion/sync-wallet.js";

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);

try {
  const vault = new RefreshTokenVault(pool, config.tokenEncryptionKey);
  const tokens = new EsiTokenProvider(config, vault);
  const esi = new EsiClient(config, tokens);
  const store = new PostgresWalletStore(pool, config.corporationId, 1);
  const result = await syncWalletDivision1(esi, store, config.corporationId);
  process.stdout.write(
    `Wallet division 1 sync completed: ${result.syncRunId} — ${result.recordCount} source records\\n`
  );
} catch (error) {
  process.stderr.write(
    `Wallet division 1 sync failed: ${error instanceof Error ? error.message : "Unknown error"}\\n`
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
