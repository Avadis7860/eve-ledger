# CCP ESI source contracts

This document records the initial source boundary. The live ESI OpenAPI schema remains the final authority for field names, types, and response details; implementation must pin and validate against the selected schema version.

## Scope

- Corporation wallet division: **1 (Master Wallet)**.
- Corporation identity and ESI authorization are deployment configuration.
- Required access: corporation wallet read scope and the corresponding corporation role/permissions (Accountant or Junior Accountant, subject to the endpoint contract).

## Corporate wallet transactions

Route: `GET /corporations/{corporation_id}/wallets/{division}/transactions/`

- Scope: `esi-wallet.read_corporation_wallets.v1`
- Division parameter: `1`
- Supports `from_id` pagination.
- Transaction identifiers, journal references, date, buy/sell flag, client, location, quantity, type, and unit price are source evidence.
- Pagination proceeds from newest toward older records. Subsequent requests use the last record identifier from the preceding response. The cursor record is included again; deduplicate it by stable transaction ID.
- Persist and validate the exact cursor progression. Never assume the endpoint's retention horizon without testing and documenting observed coverage.

## Corporate wallet journal

Route: `GET /corporations/{corporation_id}/wallets/{division}/journal/`

- Scope: `esi-wallet.read_corporation_wallets.v1`
- Division parameter: `1`
- Journal history is limited to the most recent 30 days.
- Page-based pagination must be exhausted and checked for ordering, duplicates, and incomplete pages.
- The journal is a separate source from market transactions; it includes wallet events that are not necessarily market transactions.

## Corporate wallet balance

Route: `GET /corporations/{corporation_id}/wallets/`

- Treat the returned division balances as snapshots.
- Store retrieval time and source response metadata.
- Never synthesize historical balances from a current snapshot.

## Contract discipline

- Pin an ESI OpenAPI/schema revision for implementation and record it in the repository.
- Validate required and optional fields at the API boundary.
- Preserve unknown fields in raw evidence to tolerate forward-compatible schema changes.
- Respect ESI rate limits, error responses, cache headers, and retry guidance.
- Do not assume that every journal event has a matching transaction or vice versa.
