# EVE Ledger

Independent financial ledger and analytics for EVE Online corporation trading activity.

## Project objective

Build an auditable financial source of truth from CCP ESI data before implementing inventory cost basis or realized-profit calculations. The system must make collection completeness, source limitations, and every transformation inspectable.

## Initial scope

- Corporation wallet division **1 (Master Wallet)** only; this is the trading wallet division.
- CCP ESI is the authoritative automated source.
- Corporate wallet transactions and corporate wallet journal are collected independently.
- Wallet balance is stored as a point-in-time observation, not treated as a historical ledger.
- RIFT remains a manual external reference. No RIFT API or automated integration is in scope.
- EVE Trade is a separate project. No code, database, or runtime dependency on it.
- No FIFO or profit calculation is part of the initial ingestion milestone.

## Financial integrity principles

1. Preserve source observations; never overwrite raw evidence with derived values.
2. Make ingestion idempotent and traceable to a sync run and source response.
3. Never silently discard malformed, duplicate, out-of-order, or unclassified records.
4. Report coverage, freshness, pagination progress, and known gaps explicitly.
5. Distinguish cash movement from economic income, expense, inventory acquisition, and realized profit.
6. Do not infer missing acquisition cost or classify internal transfers as trading income/expense without evidence.
7. Keep source facts, normalized ledger entries, classifications, and analytics as separate layers.

## First milestone

Reliable, repeatable ingestion of wallet division 1 transactions, journal entries, and balance observations, with measurable coverage and reconciliation diagnostics. Historical journal data older than the ESI retention window cannot be recovered retroactively through that endpoint; continuous collection is therefore mandatory.

## Documentation

- [System overview](docs/architecture/system-overview.md)
- [Data flow](docs/architecture/data-flow.md)
- [Financial domain model](docs/domain/financial-model.md)
- [ESI source contracts](docs/ingestion/esi-source-contracts.md)
- [Backfill and synchronization](docs/ingestion/backfill-and-sync.md)
- [Integrity and reconciliation](docs/reconciliation/coverage-and-integrity.md)
- [Cash flow and volatility](docs/analytics/cash-flow-and-volatility.md)
- [Milestones](docs/roadmap/milestones.md)
- [Known limitations](docs/state/known-limitations.md)

## Configuration

The corporation ID, ESI application credentials, token storage, and deployment configuration must be supplied through secure environment configuration. Never commit secrets, access tokens, refresh tokens, or real wallet exports.
