# System overview

## Architectural objective

EVE Ledger is an independent accounting and analytics system. Its first responsibility is trustworthy evidence capture, not a visually convincing profit dashboard.

## Logical layers

1. **ESI acquisition** — authenticated, rate-aware clients for corporation wallet transactions, journal, and balances.
2. **Raw evidence** — immutable source payloads or immutable normalized source snapshots, including retrieval metadata.
3. **Normalization** — typed records with source identifiers and explicit handling of optional or unknown fields.
4. **Financial ledger** — canonical cash movements and journal events, without prematurely assigning profitability semantics.
5. **Classification** — explicit, reviewable rules for trading, fees, taxes, transfers, and other event types.
6. **Analytics** — cash flow, balances, volatility, exposure, and eventually inventory cost basis and realized profit.
7. **Presentation** — dashboards and reports that expose coverage and uncertainty alongside metrics.

## Initial technical direction

- TypeScript for application and domain code.
- PostgreSQL for durable storage and transactional ingestion.
- Automated tests for pagination, idempotency, schema evolution, classification, and reconciliation.
- CI must run formatting, linting, type checking, and tests.
- Database migrations are versioned and reviewed.

These are architectural decisions for the initial implementation, not permission to introduce unnecessary infrastructure. Keep the first deployment small and operationally understandable.

## Non-goals for the first milestone

- Reusing EVE Trade code or its FIFO engine.
- Automated RIFT integration.
- Tracking all six corporation wallet divisions.
- Claiming net profit from wallet balance changes alone.
- Hiding incomplete coverage behind aggregate KPIs.
