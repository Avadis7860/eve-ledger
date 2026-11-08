import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { EsiResponse, WalletTransaction } from "../../src/esi/contracts.js";
import { PostgresWalletStore } from "../../src/persistence/postgres-wallet-store.js";
import type { EvidenceInput, TransactionCheckpoint } from "../../src/persistence/types.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;

databaseSuite("PostgresWalletStore integration", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const corporationId = "98000001";
  const store = new PostgresWalletStore(pool, corporationId, 1);

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE wallet_balance_snapshots, wallet_transactions, wallet_journal_entries,
               source_responses, sync_checkpoints, sync_runs RESTART IDENTITY CASCADE
    `);
  });

  function apiResponse(rawBody: string): EsiResponse<unknown[]> {
    return {
      data: [],
      rawBody,
      status: 200,
      retrievedAt: new Date("2026-11-09T12:00:00Z"),
      headers: {
        etag: '"integration"',
        lastModified: null,
        expires: null,
        xPages: null,
        errorLimitRemain: "100",
        errorLimitReset: "0"
      }
    };
  }

  function transaction(unitPrice = "125.50"): WalletTransaction {
    return {
      transactionId: "9007199254740993",
      journalRefId: "9007199254741001",
      date: "2026-11-09T11:59:00Z",
      isBuy: true,
      clientId: "90000002",
      locationId: "60003760",
      quantity: "2",
      typeId: 34,
      unitPrice
    };
  }

  async function capture(runId: string, body: string): Promise<string> {
    const response = apiResponse(body);
    const input: EvidenceInput<unknown[]> = {
      syncRunId: runId,
      source: "transactions",
      endpoint: "/v1/corporations/{corporation_id}/wallets/1/transactions/",
      requestParams: {},
      pageNumber: null,
      cursorValue: null,
      response,
      recordCount: 1
    };
    return store.captureResponse(input);
  }

  it("is idempotent, preserves conflicting raw evidence and advances checkpoints atomically", async () => {
    const runId = await store.startSyncRun(corporationId);
    const checkpoint: TransactionCheckpoint = {
      latestId: "9007199254740993",
      backfillCursor: "9007199254740993",
      backfillComplete: false
    };

    const firstEvidence = await capture(runId, '{"observation":"first"}');
    await store.saveTransactionsPage(firstEvidence, [transaction()], checkpoint);

    const duplicateEvidence = await capture(runId, '{"observation":"replayed"}');
    await store.saveTransactionsPage(duplicateEvidence, [transaction()], checkpoint);

    const conflictingEvidence = await capture(runId, '{"observation":"conflict"}');
    await expect(
      store.saveTransactionsPage(conflictingEvidence, [transaction("126.00")], {
        latestId: "9007199254740994",
        backfillCursor: "9007199254740994",
        backfillComplete: false
      })
    ).rejects.toThrow("Conflicting source data detected");

    const transactions = await pool.query(
      "SELECT transaction_id::text, unit_price::text FROM wallet_transactions"
    );
    const rawEvidence = await pool.query(
      "SELECT count(*)::integer AS count FROM source_responses WHERE sync_run_id = $1",
      [runId]
    );
    const savedCheckpoint = await store.getTransactionCheckpoint(corporationId);

    expect(transactions.rows).toEqual([
      { transaction_id: "9007199254740993", unit_price: "125.500000000000" }
    ]);
    expect(rawEvidence.rows[0]?.count).toBe(3);
    expect(savedCheckpoint).toEqual(checkpoint);
  });

  it("rejects mutation of captured raw ESI response rows", async () => {
    const runId = await store.startSyncRun(corporationId);
    const evidenceId = await capture(runId, '{"immutable":true}');

    await expect(
      pool.query("UPDATE source_responses SET response_body = '{}' WHERE id = $1", [evidenceId])
    ).rejects.toThrow("source_responses is append-only");
  });
});
