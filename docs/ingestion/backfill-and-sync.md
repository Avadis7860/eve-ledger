# Backfill and synchronization strategy

## Transaction ingestion

Transaction history uses two independent controls:

- `latestId`: the highest observed transaction ID, used as the incremental high-water mark.
- `backfillCursor` and `backfillComplete`: the oldest committed cursor and completion state for the historical scan.

A sync first brings the latest window forward to the previous high-water mark. It then resumes the historical cursor if the backfill is incomplete. This prevents each scheduled run from rescanning the entire historical transaction history.

For every page:

1. Fetch the ESI response.
2. Persist its exact body and retrieval metadata as raw evidence before validating or normalizing records.
3. Validate cursor repetition and monotonic progress.
4. Upsert normalized transactions by stable `transaction_id`.
5. Commit normalized rows and the updated checkpoint in one PostgreSQL transaction.

The cursor row may be included again at a page boundary. Raw evidence keeps the duplicate observation; normalized storage deduplicates it. A source identifier whose normalized facts change is treated as a conflict and causes the source run to be partial rather than overwriting the previous record.

The historical scan stops only when the API returns an empty page or only the repeated cursor. A safety limit prevents an endless pagination loop.

## Journal ingestion

1. Fetch page 1 and preserve its raw response.
2. Require a valid `X-Pages` header.
3. Fetch and preserve every page from 1 through the announced count.
4. Require the count to remain stable during the run.
5. Normalize each journal event by its stable journal entry ID.

A missing or changing page count makes the run partial. Each page's raw evidence remains available for diagnosis even when normalization or later-page retrieval fails.

## Balance observations

Poll the corporation wallets endpoint and preserve the complete response. Normalize only the division 1 balance with its retrieval timestamp. A snapshot is not a historical ledger.

## Partial-run semantics

- Each source response is captured before normalization.
- Normalized rows and transaction checkpoints commit atomically.
- A request, validation, cursor, page-count, or record-conflict failure leaves the overall wallet sync marked `partial`.
- A partial run is never labelled complete.
- Sync runs record start/end state, number of source responses, normalized/source record count, and an error summary.

## Operational cadence

The journal is limited to a rolling 30-day window and must be polled frequently enough to avoid data loss. ESI's cache headers must be respected; do not assume repeated requests bypass the server-side cache. Transactions and balance snapshots have independent update characteristics and should be scheduled and monitored separately as the runtime evolves.
