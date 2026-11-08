# Data flow and persistence boundaries

## Ingestion path

ESI response -> immutable source observation -> validated source record -> normalized record -> financial event projection -> classified analytics.

Every stage must retain a path back to the source observation and sync run.

## Evidence metadata

For each request/response observation, retain as available:

- source endpoint and corporation/division scope;
- retrieval timestamp (UTC);
- request parameters, including page or from_id cursor;
- HTTP status and relevant response headers (including ETag when available);
- response hash and payload, subject to safe handling;
- sync-run identifier, duration, retry count, and outcome;
- record count and identifier range.

Never store bearer tokens or authorization headers in logs or evidence payloads.

## Persistence rules

- Raw evidence is append-only.
- Normalized source records are idempotently upserted by stable ESI identifiers and source namespace.
- A changed representation of an existing source identifier is recorded as an observation/change, not silently treated as a new financial event.
- Derived classifications and analytics are versioned/recomputable.
- Deletion or correction in a source must be represented explicitly if the source contract permits it; absence from a later page is not proof of deletion.

## Failure handling

A failed page must leave the sync run visibly incomplete. A retry resumes from a verified cursor/checkpoint. Do not advance a durable checkpoint until the page and its records are committed successfully.
