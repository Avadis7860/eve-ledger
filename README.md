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
8. Preserve ESI numeric values as strings through parsing and PostgreSQL `NUMERIC`; do not use JavaScript floating-point arithmetic for ISK.

## Current implementation

The implementation branch currently contains the first M0/M1 slice:

- strict TypeScript project, ESLint, Prettier, Vitest, and GitHub Actions quality workflow;
- versioned PostgreSQL schema and migration runner;
- EVE SSO refresh-token provider with AES-256-GCM encryption for rotated refresh tokens stored in PostgreSQL;
- authenticated ESI client with a pinned compatibility date, bounded retries, and ESI error-budget handling;
- separate transaction `from_id` and journal `X-Pages` pagination;
- raw response capture with SHA-256, retrieval metadata, and append-only enforcement;
- idempotent normalized transaction/journal persistence and wallet division 1 balance snapshots;
- a local sync command and unit tests for numeric precision, pagination boundaries, token refresh, and partial-run behavior.

M0/M1 are **not considered production-complete** until the GitHub workflow is green, migrations are exercised against PostgreSQL, and a real authorized ESI read is validated with the corporation's role and scope. The local OAuth authorization/callback bootstrap is not implemented yet; the current command expects an already-issued refresh token.

## Quick start

Requirements: Node.js 22+, PostgreSQL, and an EVE SSO application configured for the corporation wallet read scope.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local configuration:

   ```bash
   cp .env.example .env
   ```

3. Fill in `DATABASE_URL`, `ESI_CORPORATION_ID`, `ESI_CLIENT_ID`, `ESI_CLIENT_SECRET`, and an already-authorized `ESI_REFRESH_TOKEN`. The granted scope must include `esi-wallet.read_corporation_wallets.v1`. Do not paste credentials or tokens into chat, issues, logs, or commits.

4. Generate a 32-byte key and put its Base64 output in `TOKEN_ENCRYPTION_KEY`:

   ```bash
   openssl rand -base64 32
   ```

   The key encrypts refresh-token rotations stored in PostgreSQL. Keep a secure backup; losing it makes stored rotated tokens unreadable.

5. Apply the database schema and run the first collection:

   ```bash
   npm run db:migrate
   npm run sync:wallet
   ```

The migration command requires only `DATABASE_URL`. The sync command requires the ESI configuration and database schema. Each run creates a `sync_runs` record. Endpoint failures produce a `partial` run rather than a false success.

During local development, run `npm run format` before committing. The pull-request workflow also applies the repository formatter and records a dedicated style commit when it finds formatting drift.

## ESI source contracts

| Dataset | Versioned endpoint | Collection model | Important limitation |
|---|---|---|---|
| Wallet transactions | `GET /v1/corporations/{corporation_id}/wallets/1/transactions/` | `from_id` cursor, newest to oldest | Separate retention behavior; do not assume unlimited history |
| Wallet journal | `GET /v4/corporations/{corporation_id}/wallets/1/journal/` | Page number and `X-Pages` | Rolling 30-day history |
| Wallet balances | `GET /v1/corporations/{corporation_id}/wallets/` | Snapshot | Current observation only |

ESI requests send `X-Compatibility-Date` (default pinned to `2026-11-09`) and a `User-Agent`. Update the compatibility date only after reviewing the corresponding ESI changes and updating tests/contracts.

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

## Secret handling

Never commit `.env`, ESI client secrets, access tokens, refresh tokens, or database passwords. Raw wallet evidence is financial data and must remain in the private database; do not publish real wallet exports or database backups.
