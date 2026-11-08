import { describe, expect, it, vi } from "vitest";
import type { EsiResponse } from "../../src/esi/contracts.js";
import type { EsiClient } from "../../src/esi/client.js";
import { syncWalletDivision1 } from "../../src/ingestion/sync-wallet.js";
import type {
  EvidenceInput,
  TransactionCheckpoint,
  WalletStore
} from "../../src/persistence/types.js";

function response<T>(data: T, xPages: number | null = null): EsiResponse<T> {
  return {
    data,
    rawBody: JSON.stringify(data),
    status: 200,
    retrievedAt: new Date("2026-11-09T12:00:00Z"),
    headers: {
      etag: null,
      lastModified: null,
      expires: null,
      xPages,
      errorLimitRemain: "100",
      errorLimitReset: "0"
    }
  };
}

function transaction(id: string) {
  return {
    transaction_id: id,
    journal_ref_id: "9001",
    date: "2026-11-09T12:00:00Z",
    is_buy: true,
    client_id: "90000002",
    location_id: "60003760",
    quantity: "2",
    type_id: "34",
    unit_price: "125.50"
  };
}

function setup() {
  const transactionState: { value: TransactionCheckpoint } = {
    value: { latestId: null, backfillCursor: null, backfillComplete: false }
  };
  const store = {
    startSyncRun: vi.fn().mockResolvedValue("run-1"),
    finishSyncRun: vi.fn().mockResolvedValue(undefined),
    getTransactionCheckpoint: vi.fn().mockImplementation(async () => transactionState.value),
    saveTransactionsPage: vi.fn().mockImplementation(
      async (
        _input: EvidenceInput<unknown[]>,
        _records: unknown[],
        checkpoint: TransactionCheckpoint
      ) => {
        transactionState.value = checkpoint;
      }
    ),
    saveJournalPage: vi.fn().mockResolvedValue(undefined),
    saveBalanceSnapshot: vi.fn().mockResolvedValue(undefined)
  } as unknown as WalletStore & {
    startSyncRun: ReturnType<typeof vi.fn>;
    finishSyncRun: ReturnType<typeof vi.fn>;
    saveTransactionsPage: ReturnType<typeof vi.fn>;
    saveJournalPage: ReturnType<typeof vi.fn>;
    saveBalanceSnapshot: ReturnType<typeof vi.fn>;
  };

  const esi = {
    getTransactions: vi.fn()
      .mockResolvedValueOnce(response([transaction("100"), transaction("90")]))
      .mockResolvedValueOnce(response([transaction("90")])),
    getJournal: vi.fn().mockResolvedValue(
      response([{
        id: "9001",
        date: "2026-11-09T12:00:00Z",
        ref_type: "market_transaction",
        first_party_id: "90000001",
        second_party_id: "90000002",
        amount: "-251",
        balance: "999749",
        reason: null,
        context_id: null,
        context_id_type: null,
        description: "Market transaction"
      }], 1)
    ),
    getWallets: vi.fn().mockResolvedValue(
      response([
        { division: 1, balance: "999749.123456789" },
        { division: 2, balance: "100" }
      ])
    )
  } as unknown as EsiClient & {
    getTransactions: ReturnType<typeof vi.fn>;
    getJournal: ReturnType<typeof vi.fn>;
    getWallets: ReturnType<typeof vi.fn>;
  };

  return { esi, store, transactionState };
}

describe("syncWalletDivision1", () => {
  it("collects transactions, every journal page and only the Master Wallet balance", async () => {
    const { esi, store } = setup();

    const result = await syncWalletDivision1(esi, store, "98000001");

    expect(result).toEqual({ syncRunId: "run-1", recordCount: 4 });
    expect(esi.getTransactions).toHaveBeenNthCalledWith(1, "98000001", undefined);
    expect(esi.getTransactions).toHaveBeenNthCalledWith(2, "98000001", "90");
    expect(store.saveTransactionsPage).toHaveBeenCalledTimes(2);
    expect(store.saveJournalPage).toHaveBeenCalledOnce();
    expect(store.saveBalanceSnapshot).toHaveBeenCalledOnce();
    expect(store.finishSyncRun).toHaveBeenCalledWith("run-1", "completed", 4, undefined);

    const savedBalance = store.saveBalanceSnapshot.mock.calls[0]?.[1];
    expect(savedBalance).toEqual({ division: 1, balance: "999749.123456789" });
  });

  it("marks the run partial when journal pagination changes mid-run", async () => {
    const { esi, store } = setup();
    esi.getJournal
      .mockReset()
      .mockResolvedValueOnce(response([], 2))
      .mockResolvedValueOnce(response([], 3));

    await expect(syncWalletDivision1(esi, store, "98000001")).rejects.toThrow("was partial");
    expect(store.finishSyncRun).toHaveBeenCalledWith(
      "run-1",
      "partial",
      expect.any(Number),
      expect.stringContaining("X-Pages changed")
    );
    expect(store.saveBalanceSnapshot).toHaveBeenCalledOnce();
  });
});
