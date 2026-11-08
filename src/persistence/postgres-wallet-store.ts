import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  WalletBalance,
  WalletJournalEntry,
  WalletTransaction,
} from "../esi/contracts.js";
import type {
  EvidenceInput,
  TransactionCheckpoint,
  WalletStore,
} from "./types.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function dateValue(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error("ESI returned an invalid timestamp");
  return date;
}

export class PostgresWalletStore implements WalletStore {
  constructor(
    private readonly pool: Pool,
    private readonly corporationId: string,
    private readonly division = 1,
  ) {
    if (division !== 1)
      throw new Error("EVE Ledger only supports corporation wallet division 1");
  }

  async startSyncRun(corporationId: string): Promise<string> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO sync_runs (id, corporation_id, division, source, status)
       VALUES ($1, $2, $3, 'wallet', 'running')`,
      [id, corporationId, this.division],
    );
    return id;
  }

  async finishSyncRun(
    syncRunId: string,
    status: "completed" | "partial" | "failed",
    recordCount: number,
    errorSummary?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE sync_runs
       SET status = $2,
           record_count = $3,
           finished_at = now(),
           error_summary = $4,
           request_count = (
             SELECT count(*)::integer FROM source_responses WHERE sync_run_id = $1
           )
       WHERE id = $1`,
      [syncRunId, status, recordCount, errorSummary ?? null],
    );
  }

  async getTransactionCheckpoint(
    corporationId: string,
  ): Promise<TransactionCheckpoint> {
    const result = await this.pool.query<{ checkpoint: unknown }>(
      `SELECT checkpoint FROM sync_checkpoints
       WHERE corporation_id = $1 AND division = $2 AND source = 'transactions'`,
      [corporationId, this.division],
    );
    const value = result.rows[0]?.checkpoint;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { latestId: null, backfillCursor: null, backfillComplete: false };
    }
    const checkpoint = value as Record<string, unknown>;
    return {
      latestId:
        typeof checkpoint.latestId === "string" ? checkpoint.latestId : null,
      backfillCursor:
        typeof checkpoint.backfillCursor === "string"
          ? checkpoint.backfillCursor
          : null,
      backfillComplete: checkpoint.backfillComplete === true,
    };
  }

  async captureResponse<T>(input: EvidenceInput<T>): Promise<string> {
    return this.insertEvidence(input);
  }

  async saveTransactionsPage(
    evidenceId: string,
    records: WalletTransaction[],
    checkpoint: TransactionCheckpoint,
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      for (const record of records) {
        const recordHash = sha256(JSON.stringify(record));
        const result = await client.query(
          `INSERT INTO wallet_transactions (
             corporation_id, division, transaction_id, journal_ref_id, transaction_date,
             is_buy, client_id, location_id, quantity, type_id, unit_price,
             record_sha256, first_raw_response_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (corporation_id, division, transaction_id) DO UPDATE
             SET last_seen_at = now()
             WHERE wallet_transactions.record_sha256 = EXCLUDED.record_sha256
           RETURNING transaction_id`,
          [
            this.corporationId,
            this.division,
            record.transactionId,
            record.journalRefId,
            dateValue(record.date),
            record.isBuy,
            record.clientId,
            record.locationId,
            record.quantity,
            record.typeId,
            record.unitPrice,
            recordHash,
            evidenceId,
          ],
        );
        if (result.rowCount !== 1) {
          throw new Error(
            `Conflicting source data detected for transaction ${record.transactionId}`,
          );
        }
      }

      await this.writeCheckpoint(client, "transactions", checkpoint);
    });
  }

  async saveJournalPage(
    evidenceId: string,
    records: WalletJournalEntry[],
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      for (const record of records) {
        const recordHash = sha256(JSON.stringify(record));
        const result = await client.query(
          `INSERT INTO wallet_journal_entries (
             corporation_id, division, journal_entry_id, journal_date, ref_type,
             first_party_id, second_party_id, amount, balance, reason, context_id,
             context_id_type, description, record_sha256, first_raw_response_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (corporation_id, division, journal_entry_id) DO UPDATE
             SET last_seen_at = now()
             WHERE wallet_journal_entries.record_sha256 = EXCLUDED.record_sha256
           RETURNING journal_entry_id`,
          [
            this.corporationId,
            this.division,
            record.id,
            dateValue(record.date),
            record.refType,
            record.firstPartyId,
            record.secondPartyId,
            record.amount,
            record.balance,
            record.reason,
            record.contextId,
            record.contextIdType,
            record.description,
            recordHash,
            evidenceId,
          ],
        );
        if (result.rowCount !== 1) {
          throw new Error(
            `Conflicting source data detected for journal entry ${record.id}`,
          );
        }
      }
    });
  }

  async saveBalanceSnapshot(
    evidenceId: string,
    balance: WalletBalance,
    retrievedAt: Date,
  ): Promise<void> {
    if (balance.division !== this.division) {
      throw new Error(
        "Refusing to persist a balance outside wallet division 1",
      );
    }
    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO wallet_balance_snapshots (
           corporation_id, division, balance, retrieved_at, raw_response_id
         ) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (raw_response_id, division) DO NOTHING`,
        [
          this.corporationId,
          this.division,
          balance.balance,
          retrievedAt,
          evidenceId,
        ],
      );
    });
  }

  private async insertEvidence<T>(input: EvidenceInput<T>): Promise<string> {
    const expiresAt =
      input.response.headers.expires === null
        ? null
        : dateValue(input.response.headers.expires);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO source_responses (
         sync_run_id, source, endpoint, request_params, page_number, cursor_value,
         http_status, retrieved_at, etag, last_modified, expires_at, x_pages,
         response_sha256, response_body, record_count
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        input.syncRunId,
        input.source,
        input.endpoint,
        JSON.stringify(input.requestParams),
        input.pageNumber,
        input.cursorValue,
        input.response.status,
        input.response.retrievedAt,
        input.response.headers.etag,
        input.response.headers.lastModified,
        expiresAt,
        input.response.headers.xPages,
        sha256(input.response.rawBody),
        input.response.rawBody,
        input.recordCount,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Failed to persist source evidence response");
    return id;
  }

  private async writeCheckpoint(
    client: PoolClient,
    source: "transactions",
    checkpoint: TransactionCheckpoint,
  ): Promise<void> {
    await client.query(
      `INSERT INTO sync_checkpoints (corporation_id, division, source, checkpoint)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (corporation_id, division, source) DO UPDATE SET
         checkpoint = EXCLUDED.checkpoint,
         updated_at = now()`,
      [this.corporationId, this.division, source, JSON.stringify(checkpoint)],
    );
  }

  private async withTransaction(
    operation: (client: PoolClient) => Promise<void>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await operation(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
