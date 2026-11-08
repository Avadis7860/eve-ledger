# Backfill and synchronization strategy

## Separate synchronization jobs

### Transactions

1. Initial run starts without `from_id`.
2. Store each page before advancing the cursor.
3. Use the final record's transaction ID as the next `from_id`.
4. Expect the cursor record to be repeated; deduplicate it by stable transaction ID.
5. Stop when the response contains only the cursor record.
6. Record earliest/latest dates, counts, cursor chain, and any gaps or anomalies.

### Journal

1. Start immediately; the API only exposes a rolling 30-day history.
2. Fetch all available pages.
3. Persist page observations and journal records atomically.
4. Run frequently enough to avoid losing entries as they age out of the API window.
5. Track last successful poll and the oldest/newest journal timestamp observed.

### Balance

Poll and store snapshots on a deliberate cadence. The balance is a control total at a point in time, not a replacement for journal history.

## Checkpoints and retries

- A sync run has explicit states: started, running, completed, partial, failed.
- Checkpoints are committed only after successful durable persistence.
- Retries are bounded and respect ESI rate-limit and error semantics.
- A partial run remains partial; it must not be reported as complete.
- Backfills and incremental syncs are independently observable.

## Operational monitoring

Expose last success, last attempt, lag, page count, row count, cursor progress, oldest/newest timestamp, errors, and known coverage gaps per source and division.

## Important limitation

A first-time journal backfill cannot recover journal entries older than the 30-day ESI window. The transaction endpoint is separately paginated and may provide older market transaction history, but that does not reconstruct the missing non-market journal events.
