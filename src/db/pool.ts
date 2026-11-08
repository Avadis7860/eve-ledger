import { Pool } from "pg";

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "eve-ledger",
  });
}
