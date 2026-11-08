# Financial domain model

## Separate facts from interpretations

The system must not collapse these concepts:

- **Wallet transaction:** item-level market transaction evidence (buy/sell, quantity, type, unit price, client/location, timestamp, journal reference).
- **Wallet journal entry:** wallet-level accounting event with its own identifier, amount, balance, context, and reference fields as defined by the ESI schema.
- **Balance observation:** point-in-time balance reported by ESI.
- **Cash movement:** normalized movement affecting wallet cash.
- **Economic classification:** interpretation such as sale proceeds, inventory purchase, broker fee, sales tax, internal transfer, or unknown.
- **Inventory movement / cost basis:** later domain layer connecting acquired and disposed goods.
- **Realized profit:** computed only when sale proceeds and attributable costs/fees/taxes are sufficiently evidenced.

## Critical accounting constraints

- Cash inflow is not automatically revenue or profit.
- Buying inventory is a cash outflow, but not necessarily an expense recognized at the same moment as a sale.
- Selling an item creates proceeds; realized margin requires a defensible cost basis and relevant costs.
- Wallet balance delta is not profit. It can include transfers, funding, withdrawals, inventory purchases, fees, and timing effects.
- Transfers between owned wallets/characters must not be counted as external trading income/expense when identified.
- Unclassified entries remain visible as unclassified; do not force a best guess.
- A transaction's journal reference may be absent or use a sentinel value. Matching is conditional, not a universal one-to-one assumption.

## Precision

Use exact decimal/numeric representations for ISK and unit prices. Do not use binary floating-point arithmetic for persisted financial amounts or aggregation. Preserve original source precision.
