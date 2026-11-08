# Coverage, integrity, and reconciliation

## Required controls

- Unique stable identifiers per source namespace.
- Duplicate detection and explicit duplicate counters.
- Pagination cursor monotonicity/progress checks.
- Timestamp ordering checks without assuming perfect ordering unless guaranteed by contract.
- Page counts and record counts retained per sync run.
- Missing-page and failed-window visibility.
- Raw-to-normalized row count and validation outcome reporting.
- Freshness and historical coverage metrics for each source.

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

A source is not complete merely because an API request returned HTTP 200. Completion requires exhausted pagination, committed records, valid cursor progression, and recorded coverage diagnostics.
