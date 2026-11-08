# Known limitations and open decisions

## Confirmed constraints

- Only corporation wallet division 1 (Master Wallet) is in scope initially.
- Corporate wallet journal endpoint exposes a rolling 30-day window; missed older journal entries cannot be backfilled from that endpoint.
- Wallet balance is a point-in-time snapshot.
- RIFT is manual and its metric definitions/scope have not yet been formally mapped.
- No cost-basis or profit methodology is approved for implementation yet.
- The transaction endpoint and journal endpoint have different pagination models and coverage characteristics.

## Must be validated during implementation

- Actual corporation role and ESI authorization availability.
- Current ESI OpenAPI schema version and exact response fields.
- Transaction endpoint historical retention and practical maximum backfill.
- Journal page ordering and behavior at page boundaries.
- Balance endpoint response structure and division mapping.
- Sign conventions and semantics for each journal ref type.
- How internal transfers between the user's wallets/characters can be identified with sufficient confidence.

## Explicitly prohibited assumptions

- Do not assume the six wallet divisions should be aggregated.
- Do not assume all journal entries are trading revenue or expenses.
- Do not assume every market transaction has a journal match available.
- Do not assume wallet cash delta equals profit.
- Do not assume the RIFT 30B/1B observation is a return percentage.
- Do not fabricate missing historical records or acquisition costs.
