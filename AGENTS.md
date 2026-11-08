# Engineering instructions for EVE Ledger

## Non-negotiable domain rules

- The initial scope is corporation wallet division **1 (Master Wallet)** only.
- EVE Ledger is independent of EVE Trade. Do not import, copy, or depend on its FIFO engine or database.
- Preserve raw ESI evidence and provenance. Never overwrite source facts with derived values.
- Treat transactions, journal entries, and balance snapshots as separate source types.
- The journal endpoint's rolling 30-day history requires continuous polling.
- Never equate cash movement, wallet balance delta, turnover, or inventory purchases with realized profit.
- Keep unknown classifications explicit. Do not fabricate missing costs, transfers, or historical records.
- RIFT remains a manual external reference; do not build an API integration.

## Implementation standards

- TypeScript with strict compiler settings.
- PostgreSQL with versioned migrations.
- Exact decimal arithmetic for ISK; no binary floating-point for money.
- Idempotent ingestion and durable checkpoints.
- Every derived record must be traceable to source records and a rule/version.
- Tests must cover pagination boundaries, cursor progress, retries, duplicate delivery, partial failures, and financial sign conventions.
- Prefer small modules with explicit contracts over broad service classes.
- Validate external input at boundaries; preserve unknown source fields in raw evidence.
- Never log secrets, access tokens, refresh tokens, or authorization headers.

## Delivery discipline

- Read the relevant domain and ingestion documentation before changing behavior.
- Update documentation when a contract, assumption, limitation, or acceptance criterion changes.
- Do not mark a milestone complete without executable tests and observable evidence.
- Do not weaken tests or hide incomplete coverage to make CI green.
