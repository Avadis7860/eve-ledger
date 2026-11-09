import { describe, expect, it } from "vitest";
import {
  parseWalletJournalEntry,
  parseWalletTransaction,
} from "../../src/esi/contracts.js";
import { parseEsiJson } from "../../src/esi/json.js";

describe("lossless ESI JSON parsing", () => {
  it("preserves large IDs and decimal money lexemes exactly", () => {
    const parsed = parseEsiJson<{ transaction_id: string; unit_price: string }>(
      '{"transaction_id":9007199254740993,"unit_price":1234567890123.123456789}',
    );

    expect(parsed.transaction_id).toBe("9007199254740993");
    expect(parsed.unit_price).toBe("1234567890123.123456789");
  });
});

describe("wallet source contracts", () => {
  it("normalizes a transaction without converting ISK through floating point", () => {
    const result = parseWalletTransaction({
      transaction_id: "9007199254740993",
      journal_ref_id: "9007199254741001",
      date: "2026-11-09T12:00:00Z",
      is_buy: true,
      client_id: "90000001",
      location_id: "60003760",
      quantity: "2",
      type_id: "34",
      unit_price: "1234567890123.123456789",
    });

    expect(result.transactionId).toBe("9007199254740993");
    expect(result.unitPrice).toBe("1234567890123.123456789");
    expect(result.typeId).toBe(34);
  });

  it("retains nullable journal attributes and exact balances", () => {
    const result = parseWalletJournalEntry({
      id: "123",
      date: "2026-11-09T12:00:00Z",
      ref_type: "market_transaction",
      first_party_id: null,
      second_party_id: "90000001",
      amount: "-9007199254740.123456789",
      balance: "9007199254740993.123456789",
      reason: null,
      context_id: null,
      context_id_type: null,
      description: "Market transaction",
    });

    expect(result.firstPartyId).toBeNull();
    expect(result.amount).toBe("-9007199254740.123456789");
    expect(result.balance).toBe("9007199254740993.123456789");
  });
});
