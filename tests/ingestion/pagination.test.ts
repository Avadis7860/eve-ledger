import { describe, expect, it, vi } from "vitest";
import { collectJournalPages, collectTransactionHistory } from "../../src/ingestion/pagination.js";
import type { WalletTransaction } from "../../src/esi/contracts.js";

function transaction(id: string): WalletTransaction {
  return {
    transactionId: id,
    journalRefId: null,
    date: "2026-11-09T12:00:00Z",
    isBuy: true,
    clientId: "90000001",
    locationId: "60003760",
    quantity: "1",
    typeId: 34,
    unitPrice: "123.45"
  };
}

describe("collectTransactionHistory", () => {
  it("walks from newest to oldest and deduplicates the repeated cursor row", async () => {
    const fetchPage = vi.fn<TransactionPageFetcher>()
      .mockResolvedValueOnce([transaction("100"), transaction("90")])
      .mockResolvedValueOnce([transaction("90"), transaction("80"), transaction("70")])
      .mockResolvedValueOnce([transaction("70")]);

    const result = await collectTransactionHistory(fetchPage);

    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "90");
    expect(fetchPage).toHaveBeenNthCalledWith(3, "70");
    expect(result.uniqueRecords.map((row) => row.transactionId)).toEqual(["100", "90", "80", "70"]);
    expect(result.finalCursor).toBe("70");
  });

  it("fails closed when the API does not repeat the requested cursor", async () => {
    const fetchPage = vi.fn<TransactionPageFetcher>()
      .mockResolvedValueOnce([transaction("100"), transaction("90")])
      .mockResolvedValueOnce([transaction("80"), transaction("70")]);

    await expect(collectTransactionHistory(fetchPage)).rejects.toThrow(
      "was not repeated at the start"
    );
  });

  it("fails if the cursor does not move toward older IDs", async () => {
    const fetchPage = vi.fn<TransactionPageFetcher>()
      .mockResolvedValueOnce([transaction("100"), transaction("90")])
      .mockResolvedValueOnce([transaction("90"), transaction("95")]);

    await expect(collectTransactionHistory(fetchPage)).rejects.toThrow(
      "did not move toward older records"
    );
  });

  it("stops when only the repeated cursor remains", async () => {
    const fetchPage = vi.fn<TransactionPageFetcher>()
      .mockResolvedValueOnce([transaction("100"), transaction("90")])
      .mockResolvedValueOnce([transaction("90")]);

    const result = await collectTransactionHistory(fetchPage);

    expect(result.pages).toHaveLength(2);
    expect(result.uniqueRecords).toHaveLength(2);
  });
});

describe("collectJournalPages", () => {
  it("fetches all pages using the X-Pages count", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ records: ["a"], pageCount: 3 })
      .mockResolvedValueOnce({ records: ["b"], pageCount: 3 })
      .mockResolvedValueOnce({ records: ["c"], pageCount: 3 });

    await expect(collectJournalPages(fetchPage)).resolves.toEqual([["a"], ["b"], ["c"]]);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3);
  });

  it("rejects page-count changes rather than reporting partial data as complete", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ records: ["a"], pageCount: 2 })
      .mockResolvedValueOnce({ records: ["b"], pageCount: 3 });

    await expect(collectJournalPages(fetchPage)).rejects.toThrow("changed during pagination");
  });

  it("rejects an invalid page count", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ records: [], pageCount: 0 });
    await expect(collectJournalPages(fetchPage)).rejects.toThrow("invalid page count");
  });
});

type TransactionPageFetcher = (fromId?: string) => Promise<WalletTransaction[]>;
