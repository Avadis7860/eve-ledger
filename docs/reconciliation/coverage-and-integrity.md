# Coverage, integrity, and reconciliation

## Required controls

- Unique stable identifiers per source namespace.
- Raw ESI response capture with SHA-256, endpoint, request parameters, response headers, retrieval time, and sync-run ID.
- Append-only raw source responses; no mutation or deletion through ordinary application operations.
- Duplicate detection and explicit cursor-boundary deduplication.
- Pagination cursor monotonicity/progress checks.
- Journal page count captured and checked across the full page walk.
- Raw-to-normalized row count and validation outcome reporting.
- Freshness and historical coverage metrics for each source.
- Exact decimal arithmetic for money; never route ISK values through binary floating-point.

## Idempotency and conflict behavior

Transactions are keyed by corporation, division, and `transaction_id`. Journal entries are keyed by corporation, division, and journal entry ID. Re-delivery of an identical normalized source record updates only its last-seen timestamp.

If an existing source identifier appears with different normalized source facts, ingestion raises a conflict. It does not silently overwrite the previous row. The new raw response is retained, and the sync remains partial for operator review.

Raw response capture is committed before parsing and normalization. A page that fails validation can therefore still be examined. Normalized row writes and transaction checkpoint writes are committed atomically so a failed page is not advanced past.

## Transaction-to-journal matching

Use the transaction's journal reference only when it is present and valid. A missing/sentinel reference is not a failed match. Do not force one-to-one cardinality unless the API contract and observed data prove it.

Report separately:

- transactions with a usable journal reference;
- references matched to a journal entry;
- references not found within currently available journal coverage;
- transactions without a usable reference.

An unmatched reference may be caused by the journal's 30-day retention window. It must not automatically be labelled data corruption.

## Balance reconciliation

At a known opening balance, compare:

opening balance + supported wallet cash movements = expected closing balance.

Only run this control when the period, event coverage, and movement sign conventions are complete and understood. Explain residuals; do not plug them with invented adjustments.

## Definition of complete

A source is not complete merely because an API request returned HTTP 200. Completion requires exhausted pagination, committed records, valid cursor progression, recorded coverage diagnostics, and an explicit completed sync-run state.
