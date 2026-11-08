import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to run migrations");

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(74192026)");
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE migration_name = $1",
        [file],
      );
      if (alreadyApplied.rowCount) {
        await client.query("COMMIT");
        continue;
      }

      const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      process.stdout.write(`applied ${file}\\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
