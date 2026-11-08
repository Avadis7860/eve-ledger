export type EsiNumber = string;

export type WalletTransaction = {
  transactionId: EsiNumber;
  journalRefId: EsiNumber | null;
  date: string;
  isBuy: boolean;
  clientId: EsiNumber;
  locationId: EsiNumber;
  quantity: EsiNumber;
  typeId: number;
  unitPrice: string;
};

export type WalletJournalEntry = {
  id: EsiNumber;
  date: string;
  refType: string;
  firstPartyId: EsiNumber | null;
  secondPartyId: EsiNumber | null;
  amount: string | null;
  balance: string;
  reason: string | null;
  contextId: EsiNumber | null;
  contextIdType: string | null;
  description: string | null;
};

export type WalletBalance = {
  division: number;
  balance: string;
};

export type EsiResponse<T> = {
  data: T;
  rawBody: string;
  status: number;
  retrievedAt: Date;
  headers: {
    etag: string | null;
    lastModified: string | null;
    expires: string | null;
    xPages: number | null;
    errorLimitRemain: string | null;
    errorLimitReset: string | null;
  };
};

export function asRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`ESI field ${field} must be a non-empty string`);
  }
  return value;
}

function numericString(value: unknown, field: string, integer = false): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`ESI field ${field} must be numeric`);
  }
  const result = String(value);
  const pattern = integer ? /^-?\d+$/ : /^-?\d+(?:\.\d+)?$/;
  if (!pattern.test(result)) {
    throw new Error(`ESI field ${field} has an invalid numeric representation`);
  }
  return result;
}

function nullableNumericString(value: unknown, field: string): string | null {
  return value === null || value === undefined
    ? null
    : numericString(value, field, true);
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string")
    throw new Error(`ESI field ${field} must be text or null`);
  return value;
}

export function parseWalletTransaction(value: unknown): WalletTransaction {
  const row = asRecord(value, "wallet transaction");
  if (typeof row.is_buy !== "boolean")
    throw new Error("ESI field is_buy must be boolean");
  return {
    transactionId: numericString(row.transaction_id, "transaction_id", true),
    journalRefId: nullableNumericString(row.journal_ref_id, "journal_ref_id"),
    date: requiredString(row.date, "date"),
    isBuy: row.is_buy,
    clientId: numericString(row.client_id, "client_id", true),
    locationId: numericString(row.location_id, "location_id", true),
    quantity: numericString(row.quantity, "quantity", true),
    typeId: Number(numericString(row.type_id, "type_id", true)),
    unitPrice: numericString(row.unit_price, "unit_price"),
  };
}

export function parseWalletJournalEntry(value: unknown): WalletJournalEntry {
  const row = asRecord(value, "wallet journal entry");
  return {
    id: numericString(row.id, "id", true),
    date: requiredString(row.date, "date"),
    refType: requiredString(row.ref_type, "ref_type"),
    firstPartyId: nullableNumericString(row.first_party_id, "first_party_id"),
    secondPartyId: nullableNumericString(
      row.second_party_id,
      "second_party_id",
    ),
    amount:
      row.amount === null || row.amount === undefined
        ? null
        : numericString(row.amount, "amount"),
    balance: numericString(row.balance, "balance"),
    reason: nullableText(row.reason, "reason"),
    contextId: nullableNumericString(row.context_id, "context_id"),
    contextIdType: nullableText(row.context_id_type, "context_id_type"),
    description: nullableText(row.description, "description"),
  };
}

export function parseWalletBalance(value: unknown): WalletBalance {
  const row = asRecord(value, "wallet balance");
  const division = Number(numericString(row.division, "division", true));
  if (!Number.isInteger(division) || division < 1 || division > 7) {
    throw new Error("ESI wallet division must be an integer between 1 and 7");
  }
  return {
    division,
    balance: numericString(row.balance, "balance"),
  };
}
