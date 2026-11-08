import type {
  EsiResponse,
  WalletBalance,
  WalletJournalEntry,
  WalletTransaction
} from "../esi/contracts.js";

export type EvidenceSource = "transactions" | "journal" | "balance";

export type EvidenceInput<T> = {
  syncRunId: string;
  corporationId: string;
  source: EvidenceSource;
  endpoint: string;
  requestParams: Record<string, string>;
  pageNumber: number | null;
  cursorValue: string | null;
  response: EsiResponse<T>;
  recordCount: number;
};

export type TransactionCheckpoint = {
  latestId: string | null;
  backfillCursor: string | null;
  backfillComplete: boolean;
};

export interface WalletStore {
  startSyncRun(corporationId: string): Promise<string>;
  finishSyncRun(
    syncRunId: string,
    status: "completed" | "partial" | "failed",
    recordCount: number,
    errorSummary?: string
  ): Promise<void>;
  getTransactionCheckpoint(corporationId: string): Promise<TransactionCheckpoint>;
  saveTransactionsPage(
    input: EvidenceInput<unknown[]>,
    records: WalletTransaction[],
    checkpoint: TransactionCheckpoint
  ): Promise<void>;
  saveJournalPage(
    input: EvidenceInput<unknown[]>,
    records: WalletJournalEntry[]
  ): Promise<void>;
  saveBalanceSnapshot(
    input: EvidenceInput<unknown[]>,
    balance: WalletBalance
  ): Promise<void>;
}
