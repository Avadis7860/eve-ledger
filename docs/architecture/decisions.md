# Architecture decision records

## ADR-001 — Independent financial source of truth

**Status:** Accepted

EVE Ledger is a new, independent project. It does not reuse EVE Trade's FIFO engine, persistence model, or runtime. The reason is to establish independently verifiable source coverage and financial semantics before adding inventory accounting.

## ADR-002 — Initial wallet scope is corporation division 1

**Status:** Accepted

Only corporation wallet division 1 (Master Wallet) is in the initial scope. The other divisions are intentionally excluded to avoid mixing non-trading activity into the trading ledger.

## ADR-003 — CCP ESI is the automated source of record

**Status:** Accepted

Corporate wallet transactions, journal entries, and balance snapshots are collected from CCP ESI. RIFT remains a manual comparison/reference source; no integration is planned in the initial architecture.

## ADR-004 — Evidence first, profitability later

**Status:** Accepted

The first release prioritizes immutable source evidence, complete pagination, idempotent ingestion, coverage metrics, and reconciliation. Inventory cost basis and realized-profit calculations are deferred until the source layer is trustworthy.

## ADR-005 — Distinct source retention and pagination models

**Status:** Accepted

Transactions use from_id pagination and are synchronized independently from the page-based journal. The journal's rolling 30-day retention makes frequent collection mandatory. A transaction history cannot substitute for missing non-market journal entries.
