# Delivery roadmap

## M0 — Repository and engineering foundation

- Document scope, assumptions, and source contracts.
- Establish TypeScript project structure, formatting, linting, tests, CI, and configuration validation.
- Add threat model and secret-handling rules.

## M1 — ESI wallet evidence ingestion

- Authenticate to ESI using least-privilege scopes.
- Collect corporation wallet division 1 transactions.
- Collect journal pages continuously.
- Capture balance snapshots.
- Persist immutable source observations and idempotent normalized records.
- Add resumable checkpoints and sync-run observability.

**Acceptance:** repeat runs create no duplicate financial events; pagination can be resumed; incomplete runs remain visibly incomplete; coverage and freshness are measurable; raw evidence can explain every normalized row.

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
