# Delivery roadmap

## M0 — Repository and engineering foundation

**Implementation status: implemented and CI-verified.**

Implemented:

- TypeScript strict project structure, linting, formatting, unit-test runner, and GitHub Actions CI workflow.
- Local environment validation and secret-handling baseline.
- Versioned PostgreSQL migration and schema migration runner.
- Encrypted storage for rotated ESI refresh tokens.
- Committed dependency lockfile and deterministic `npm ci` installation.

Verified:

- GitHub Actions CI is green on the current PR head.
- PostgreSQL 16 migrations apply successfully twice.
- Prettier, ESLint, and strict TypeScript checks pass.
- Integration tests execute against the PostgreSQL service in CI.

## M1 — ESI wallet evidence ingestion

**Implementation status: code and automated tests implemented; live corporation validation remains open.**

Implemented:
- EVE SSO refresh-token provider with least-scope wallet authorization, access-token caching, and refresh-token rotation support.
- Authenticated versioned ESI client with compatibility-date pinning, bounded transient retries, and ESI error-budget handling.
- Division 1 transactions, journal pages, and balance endpoint adapters.
- Lossless numeric JSON parsing and exact decimal storage.
- Immutable raw response evidence, SHA-256 hashes, normalized records, idempotency/conflict detection, and transaction checkpoints.
- Incremental high-water-mark catch-up plus resumable historical transaction cursor.
- Tests for pagination, token refresh, numeric precision, partial-run behavior, PostgreSQL persistence idempotency, and evidence immutability.

Verified:
- Current CI passes formatting, lint, strict type checking, and all 22 tests across 6 test files.
- PostgreSQL 16 schema migration and repeat migration are successful.
- PostgreSQL integration tests verify idempotency, conflict rollback/checkpoint safety, raw evidence retention, and append-only behavior.

Remaining completion gate:

- Implement local EVE SSO authorization-code/browser callback bootstrap.
- Validate the corporation ID, ESI application, granted scope, and required corporation role using a real authorized ESI read.
- Compare live response fields, caching, page boundaries, role access, and journal semantics with the source contracts.
- Execute an initial sync and a repeated sync; inspect source freshness, coverage, and duplicate behavior.

## M2 — Financial event normalization and controls

- Normalize cash movement signs and event references.
- Implement conditional transaction/journal matching.
- Add balance reconciliation where opening balance and event coverage support it.
- Add unknown-event reporting and review workflow.

## M3 — Cash-flow analytics

- Build inflow/outflow/net movement views.
- Add period comparisons, fees/taxes breakdowns, and clearly defined volatility measures.
- Display data coverage and caveats next to every aggregate.

## M4 — Inventory and profitability

- Design item-level inventory movements and cost-basis methodology independently.
- Compare FIFO, weighted-average, and other defensible methods against explicit use cases.
- Add realized profit only after acquisition/disposal matching and fee treatment are validated.
- Never silently fill missing history or costs.

## Release gate

No profitability dashboard is considered trustworthy until source completeness, event classification, inventory coverage, and reconciliation diagnostics are visible and tested.
