# Delivery roadmap

## M0 — Repository and engineering foundation

**Implementation status:** implemented and CI-verified.

Implemented:

- TypeScript strict project structure, linting, formatting, unit-test runner, and GitHub Actions CI workflow.
- Local environment validation and secret-handling baseline.
- Versioned PostgreSQL migration and schema migration runner.
- Encrypted storage for rotated ESI refresh tokens.

Completion gate:

- GitHub Actions quality workflow is green on the current PR head.
- PostgreSQL 16 migrations and persistence integration tests pass in CI; migrations are applied twice to verify idempotency.
- A clean install is reproducible from the committed dependency lockfile with `npm ci`.

## M1 — ESI wallet evidence ingestion

**Implementation status:** first vertical slice implemented; live ESI authorization and source behavior are not yet validated.

Implemented:

- EVE SSO refresh-token provider with least-scope wallet authorization, access-token caching, and refresh-token rotation support.
- Authenticated versioned ESI client with compatibility-date pinning, bounded transient retries, and ESI error-budget handling.
- Division 1 transactions, journal pages, and balance endpoint adapters.
- Lossless numeric JSON parsing and exact decimal storage.
- Immutable raw response evidence, SHA-256 hashes, normalized records, idempotency/conflict detection, and transaction checkpoints.
- Incremental high-water-mark catch-up plus resumable historical transaction cursor.
- Unit and PostgreSQL integration tests cover pagination, token refresh, numeric precision, partial-run behavior, idempotency, conflict handling, checkpoint safety, and raw evidence immutability.

Completion gate:

- Automated quality gates are green: Prettier, ESLint, strict TypeScript, and all 22 tests across 6 files.
- PostgreSQL 16 migrations and store behavior are verified in CI.
- Valid corporation ID, scope, and required corporation role confirmed through a real ESI read.
- Observed page boundaries, cache behavior, role access, and journal field semantics compared with live ESI responses.
- An initial sync and a repeated sync produce explainable coverage and no duplicate normalized events.

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
