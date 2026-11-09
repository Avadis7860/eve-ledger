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
- native EVE SSO Authorization Code with PKCE (S256), using the system browser and a loopback-only callback;
- JWT verification against EVE SSO JWKS, issuer, audience, expiry, character subject, and the required corporation wallet scope;
- AES-256-GCM encrypted refresh-token storage and native PKCE refresh-token rotation handling;
- authenticated ESI client with a pinned compatibility date, bounded retries, and ESI error-budget handling;
- separate transaction `from_id` and journal `X-Pages` pagination;
- raw response capture with SHA-256, retrieval metadata, and append-only enforcement;
- idempotent normalized transaction/journal persistence and wallet division 1 balance snapshots;
- local authorization and wallet sync commands with unit and PostgreSQL integration tests.

The implementation is **not production-ready** until a real authorized division 1 ESI read and a repeated sync have been validated against the corporation's role, scope, and live response behavior.

## Quick start

Requirements: Node.js 22.13+, PostgreSQL, and an EVE SSO **native application** configured with the corporation wallet read scope.

1. Install locked dependencies:

   ```bash
   npm ci
   ```

2. Create local configuration:

   ```bash
   cp .env.example .env
   ```

3. Fill in `DATABASE_URL`, `ESI_CORPORATION_ID`, `ESI_CLIENT_ID`, and `TOKEN_ENCRYPTION_KEY`. In the EVE Developers Portal, configure the application as a native application, enable `esi-wallet.read_corporation_wallets.v1`, and register this exact callback URL:

   ```text
   http://127.0.0.1:3000/auth/callback
   ```

   Keep `ESI_REDIRECT_URI` identical to the registered URL. The local native flow uses PKCE and does not use an ESI client secret. Never paste credentials or tokens into chat, issues, logs, or commits.

4. Generate a 32-byte encryption key and put its Base64 output in `TOKEN_ENCRYPTION_KEY`:

   ```bash
   openssl rand -base64 32
   ```

   The key encrypts refresh tokens stored in PostgreSQL. Keep a secure backup; losing it makes stored tokens unreadable.

5. Apply the database schema and authorize the EVE character:

   ```bash
   npm run db:migrate
   npm run auth:login
   ```

   `auth:login` starts a local callback bound only to `127.0.0.1`, opens the system browser, and requests only the corporation wallet read scope. It validates the returned token before writing the refresh token to PostgreSQL. The EVE login and consent happen on CCP's EVE SSO pages; EVE account credentials are never entered into EVE Ledger.

6. Start the first collection:

   ```bash
   npm run sync:wallet
   ```

The migration command requires only `DATABASE_URL`. Authorization and sync also require the local ESI configuration and database schema. Each sync creates a `sync_runs` record. Endpoint failures produce a `partial` or `failed` run rather than a false success.

An optional `ESI_REFRESH_TOKEN` environment variable is supported only as a one-time local migration seed; normal setup uses `auth:login` and encrypted database storage.

During local development, run `npm run format` before committing. CI checks formatting but never modifies the branch or requires write permissions.

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
- [Local EVE SSO PKCE security contract](docs/security/eve-sso-native-pkce.md)
- [Backfill and synchronization](docs/ingestion/backfill-and-sync.md)
- [Integrity and reconciliation](docs/reconciliation/coverage-and-integrity.md)
- [Cash flow and volatility](docs/analytics/cash-flow-and-volatility.md)
- [Milestones](docs/roadmap/milestones.md)
- [Known limitations](docs/state/known-limitations.md)

## Secret handling

Never commit `.env`, refresh tokens, access tokens, or database passwords. The local EVE SSO flow is PKCE-based and does not use a client secret. Raw wallet evidence is financial data and must remain in the private database; do not publish real wallet exports or database backups.
