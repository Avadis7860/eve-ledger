import type {
  EsiResponse,
  WalletBalance,
  WalletJournalEntry,
  WalletTransaction
} from "../esi/contracts.js";
import {
  parseWalletBalance,
  parseWalletJournalEntry,
  parseWalletTransaction
} from "../esi/contracts.js";
import type { EsiClient } from "../esi/client.js";
import type { TransactionCheckpoint, WalletStore } from "../persistence/types.js";

const TRANSACTIONS_ENDPOINT = "/v1/corporations/{corporation_id}/wallets/1/transactions/";
const JOURNAL_ENDPOINT = "/v4/corporations/{corporation_id}/wallets/1/journal/";
const BALANCE_ENDPOINT = "/v1/corporations/{corporation_id}/wallets/";

function newerId(left: string | null, right: string): string {
  return left === null || BigInt(right) > BigInt(left) ? right : left;
}

function evidenceInput<T>(
  syncRunId: string,
  source: "transactions" | "journal" | "balance",
  endpoint: string,
  response: EsiResponse<T>,
  requestParams: Record<string, string>,
  pageNumber: number | null,
  cursorValue: string | null,
  recordCount: number
) {
  return {
    syncRunId,
    source,
    endpoint,
    requestParams,
    pageNumber,
    cursorValue,
    response,
    recordCount
  };
}

async function syncTransactions(
  esi: EsiClient,
  store: WalletStore,
  corporationId: string,
  syncRunId: string
): Promise<number> {
  const initial = await store.getTransactionCheckpoint(corporationId);
  let checkpoint: TransactionCheckpoint = { ...initial };
  let stored = 0;
  const maxPages = 10_000;

  // Bring the latest window forward to the previous high-water mark.
  if (checkpoint.latestId !== null) {
    const previousHighWater = checkpoint.latestId;
    let cursor: string | undefined;
    for (let index = 0; index < maxPages; index += 1) {
      const response = await esi.getTransactions(corporationId, cursor);
      const input = evidenceInput(
        syncRunId,
        "transactions",
        TRANSACTIONS_ENDPOINT,
        response,
        cursor === undefined ? {} : { from_id: cursor },
        null,
        cursor ?? null,
        response.data.length
      );
      const evidenceId = await store.captureResponse(input);
      const parsed = response.data.map(parseWalletTransaction);
      if (cursor !== undefined && parsed[0]?.transactionId !== cursor) {
        throw new Error("Transaction incremental pagination did not repeat its cursor");
      }

      const crossedHighWater = parsed.some(
        (record) => BigInt(record.transactionId) <= BigInt(previousHighWater)
      );
      const nextLatest = parsed.reduce(
        (value, record) => newerId(value, record.transactionId),
        checkpoint.latestId
      );

      await store.saveTransactionsPage(evidenceId, parsed, {
        ...checkpoint,
        latestId: nextLatest
      });
      checkpoint = { ...checkpoint, latestId: nextLatest };
      stored += parsed.length - (cursor === undefined ? 0 : 1);

      if (parsed.length === 0 || crossedHighWater || (cursor !== undefined && parsed.length === 1)) {
        break;
      }
      const nextCursor = parsed[parsed.length - 1]?.transactionId;
      if (!nextCursor || (cursor !== undefined && BigInt(nextCursor) >= BigInt(cursor))) {
        throw new Error("Transaction incremental cursor failed to progress");
      }
      cursor = nextCursor;
      if (index === maxPages - 1) throw new Error("Transaction incremental page safety limit reached");
    }
  }

  // Continue the historical scan from its last atomically committed cursor.
  if (!checkpoint.backfillComplete) {
    let cursor = checkpoint.backfillCursor;
    for (let index = 0; index < maxPages; index += 1) {
      const response = await esi.getTransactions(corporationId, cursor ?? undefined);
      const input = evidenceInput(
        syncRunId,
        "transactions",
        TRANSACTIONS_ENDPOINT,
        response,
        cursor === null ? {} : { from_id: cursor },
        null,
        cursor,
        response.data.length
      );
      const evidenceId = await store.captureResponse(input);
      const parsed = response.data.map(parseWalletTransaction);

      if (cursor !== null && parsed[0]?.transactionId !== cursor) {
        throw new Error("Transaction backfill did not repeat its stored cursor");
      }

      const exhausted = parsed.length === 0 || (cursor !== null && parsed.length === 1);
      const nextCursor = exhausted ? cursor : parsed[parsed.length - 1]?.transactionId ?? null;
      if (!exhausted && nextCursor === null) {
        throw new Error("Transaction backfill returned records without a cursor");
      }
      if (!exhausted && cursor !== null && BigInt(nextCursor as string) >= BigInt(cursor)) {
        throw new Error("Transaction backfill cursor failed to progress");
      }

      const nextLatest = parsed.reduce(
        (value, record) => newerId(value, record.transactionId),
        checkpoint.latestId
      );
      const nextCheckpoint: TransactionCheckpoint = {
        latestId: nextLatest,
        backfillCursor: nextCursor,
        backfillComplete: exhausted
      };

      await store.saveTransactionsPage(evidenceId, parsed, nextCheckpoint);
      checkpoint = nextCheckpoint;
      stored += parsed.length - (cursor === null ? 0 : 1);

      if (exhausted) break;
      cursor = nextCursor;
      if (index === maxPages - 1) throw new Error("Transaction backfill page safety limit reached");
    }
  }

  return stored;
}

async function syncJournal(
  esi: EsiClient,
  store: WalletStore,
  corporationId: string,
  syncRunId: string
): Promise<number> {
  const first = await esi.getJournal(corporationId, 1);
  const firstEvidence = await store.captureResponse(
    evidenceInput(
      syncRunId,
      "journal",
      JOURNAL_ENDPOINT,
      first,
      { page: "1" },
      1,
      null,
      first.data.length
    )
  );
  const pageCount = first.headers.xPages;
  if (pageCount === null || pageCount < 1 || pageCount > 10_000) {
    throw new Error("Journal response is missing a valid X-Pages count");
  }

  let stored = 0;
  for (let page = 1; page <= pageCount; page += 1) {
    const response = page === 1 ? first : await esi.getJournal(corporationId, page);
    const evidenceId =
      page === 1
        ? firstEvidence
        : await store.captureResponse(
            evidenceInput(
              syncRunId,
              "journal",
              JOURNAL_ENDPOINT,
              response,
              { page: String(page) },
              page,
              null,
              response.data.length
            )
          );

    if (response.headers.xPages !== pageCount) {
      throw new Error("Journal X-Pages changed during sync; journal run is incomplete");
    }
    const records: WalletJournalEntry[] = response.data.map(parseWalletJournalEntry);
    await store.saveJournalPage(evidenceId, records);
    stored += records.length;
  }
  return stored;
}

async function syncBalance(
  esi: EsiClient,
  store: WalletStore,
  corporationId: string,
  syncRunId: string
): Promise<number> {
  const response = await esi.getWallets(corporationId);
  const evidenceId = await store.captureResponse(
    evidenceInput(
      syncRunId,
      "balance",
      BALANCE_ENDPOINT,
      response,
      {},
      null,
      null,
      response.data.length
    )
  );
  const balances: WalletBalance[] = response.data.map(parseWalletBalance);
  const masterWallet = balances.find((balance) => balance.division === 1);
  if (!masterWallet) throw new Error("ESI response did not contain corporation wallet division 1");

  await store.saveBalanceSnapshot(evidenceId, masterWallet, response.retrievedAt);
  return 1;
}

export async function syncWalletDivision1(
  esi: EsiClient,
  store: WalletStore,
  corporationId: string
): Promise<{ syncRunId: string; recordCount: number }> {
  const syncRunId = await store.startSyncRun(corporationId);
  let recordCount = 0;
  const errors: string[] = [];

  for (const operation of [
    () => syncTransactions(esi, store, corporationId, syncRunId),
    () => syncJournal(esi, store, corporationId, syncRunId),
    () => syncBalance(esi, store, corporationId, syncRunId)
  ]) {
    try {
      recordCount += await operation();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown ingestion failure");
    }
  }

  const status = errors.length === 0 ? "completed" : "partial";
  await store.finishSyncRun(syncRunId, status, recordCount, errors.join(" | ") || undefined);
  if (errors.length > 0) {
    throw new Error(`Wallet sync ${syncRunId} was partial: ${errors.join(" | ")}`);
  }

  return { syncRunId, recordCount };
}
