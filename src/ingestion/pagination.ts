import type { WalletTransaction } from "../esi/contracts.js";

export type TransactionPageFetcher = (
  fromId?: string,
) => Promise<WalletTransaction[]>;

export type TransactionPageBatch = {
  pages: WalletTransaction[][];
  uniqueRecords: WalletTransaction[];
  finalCursor: string | null;
};

function compareIds(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Exhaust a historical transaction cursor chain.
 * The API returns newest-first pages; the next request must use the oldest
 * transaction ID in the prior page. The cursor row is expected to repeat.
 */
export async function collectTransactionHistory(
  fetchPage: TransactionPageFetcher,
  initialCursor: string | null = null,
  maxPages = 10_000,
): Promise<TransactionPageBatch> {
  const pages: WalletTransaction[][] = [];
  const uniqueRecords = new Map<string, WalletTransaction>();
  let cursor = initialCursor;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await fetchPage(cursor ?? undefined);
    pages.push(page);

    if (page.length === 0) {
      return {
        pages,
        uniqueRecords: [...uniqueRecords.values()],
        finalCursor: cursor,
      };
    }

    let records = page;
    if (cursor !== null) {
      if (page[0]?.transactionId !== cursor) {
        throw new Error(
          `Transaction cursor ${cursor} was not repeated at the start of the next page`,
        );
      }
      if (page.length === 1) {
        return {
          pages,
          uniqueRecords: [...uniqueRecords.values()],
          finalCursor: cursor,
        };
      }
      records = page.slice(1);
    }

    for (const record of records) {
      if (uniqueRecords.has(record.transactionId)) continue;
      uniqueRecords.set(record.transactionId, record);
    }

    const nextCursor = page[page.length - 1]?.transactionId;
    if (!nextCursor) {
      return {
        pages,
        uniqueRecords: [...uniqueRecords.values()],
        finalCursor: cursor,
      };
    }
    if (cursor !== null && compareIds(nextCursor, cursor) >= 0) {
      throw new Error(
        "Transaction pagination cursor did not move toward older records",
      );
    }
    if (page.length === 1 && cursor === null) {
      return {
        pages,
        uniqueRecords: [...uniqueRecords.values()],
        finalCursor: nextCursor,
      };
    }
    cursor = nextCursor;
  }

  throw new Error(
    `Transaction pagination exceeded the safety limit of ${maxPages} pages`,
  );
}

export async function collectJournalPages<T>(
  fetchPage: (page: number) => Promise<{ records: T[]; pageCount: number }>,
  maxPages = 10_000,
): Promise<T[][]> {
  const first = await fetchPage(1);
  if (
    !Number.isInteger(first.pageCount) ||
    first.pageCount < 1 ||
    first.pageCount > maxPages
  ) {
    throw new Error("Journal pagination returned an invalid page count");
  }

  const pages = [first.records];
  for (let page = 2; page <= first.pageCount; page += 1) {
    const result = await fetchPage(page);
    if (result.pageCount !== first.pageCount) {
      throw new Error(
        "Journal X-Pages changed during pagination; run is incomplete",
      );
    }
    pages.push(result.records);
  }
  return pages;
}
