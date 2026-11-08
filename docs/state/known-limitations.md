# Known limitations and open decisions

## Confirmed constraints

- Only corporation wallet division 1 (Master Wallet) is in scope initially.
- Corporate wallet journal endpoint exposes a rolling 30-day window; missed older journal entries cannot be backfilled from that endpoint.
- Wallet balance is a point-in-time snapshot.
- RIFT is manual and its metric definitions/scope have not yet been formally mapped.
- No cost-basis or profit methodology is approved for implementation yet.
- The transaction endpoint and journal endpoint have different pagination models and coverage characteristics.

## Current implementation gaps

- The local EVE SSO authorization-code/browser callback bootstrap is not implemented. The sync command requires an already-authorized refresh token for the corporation wallet scope.
- The implementation has not yet been exercised with the user's live corporation ID, ESI application, corporation role, or actual wallet responses.
- PostgreSQL 16 migrations and transactional persistence integration tests pass in GitHub Actions; migrations have been applied twice successfully.
- GitHub Actions quality gates are green, and dependency installation is reproducible from the committed lockfile with `npm ci`.
- Monitoring UI, scheduler, alerting, and a journal freshness dashboard are not implemented.

## Must be validated during implementation

- Actual corporation role and ESI authorization availability.
- Current ESI OpenAPI schema and route compatibility for the pinned date.
- Transaction endpoint historical retention and observed page-boundary behavior.
- Journal page ordering, `X-Pages` behavior, caching, and exact amount/balance semantics.
- Balance endpoint response structure and division mapping.
- Sign conventions and semantics for each journal ref type.
- Whether source facts can legitimately change after first observation; the current conflict policy intentionally fails closed.
- How internal transfers between the user's wallets/characters can be identified with sufficient confidence.

## Explicitly prohibited assumptions

- Do not assume the six wallet divisions should be aggregated.
- Do not assume all journal entries are trading revenue or expenses.
- Do not assume every market transaction has a journal match available.
- Do not assume wallet cash delta equals profit.
- Do not assume the RIFT 30B/1B observation is a return percentage.
- Do not fabricate missing historical records or acquisition costs.
