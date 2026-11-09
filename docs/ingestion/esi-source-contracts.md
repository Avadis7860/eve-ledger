# CCP ESI source contracts

This document records the ESI contract used by the current implementation. The live ESI API Explorer and OpenAPI schema remain authoritative. The application sends `X-Compatibility-Date: 2026-11-09` by default so behavior does not silently drift. Change that date only after reviewing the ESI compatibility changes and updating these contracts and tests.

## Scope and authorization

- Corporation wallet division: **1 (Master Wallet)** only.
- Required scope: `esi-wallet.read_corporation_wallets.v1`.
- Required corporation role: Accountant or Junior Accountant, subject to CCP's current route contract.
- Corporation ID, client credentials, and initial refresh token are local environment configuration.
- EVE Ledger is a local native application and uses Authorization Code with PKCE (S256), not a confidential web-app client secret.
- The local callback is bound only to `127.0.0.1`, at the exact `ESI_REDIRECT_URI` registered in the EVE Developers Portal. The default is `http://127.0.0.1:3000/auth/callback`.
- The authorization request includes `response_type=code`, `client_id`, exact `redirect_uri`, the single wallet scope, a cryptographically random `state`, and an S256 PKCE challenge.
- The callback validates `state` using constant-time comparison and accepts exactly one authorization code.
- The token exchange is form-encoded and includes `grant_type=authorization_code`, `code`, `client_id`, `redirect_uri`, and `code_verifier`. No Basic authorization header or client secret is used.
- Access-token JWTs are verified using the JWKS URI discovered from EVE SSO metadata. Validation includes RS256 signature, accepted issuer, both expected audience values, expiry, character subject, and the required wallet scope.
- The refresh-token provider uses the native-app form contract (`client_id`, refresh token, and the requested wallet scope), caches verified short-lived access tokens, and persists any rotated refresh token encrypted in PostgreSQL.
- Use `npm run auth:login` for the local browser authorization flow. A legacy `ESI_REFRESH_TOKEN` environment value is accepted only as an optional one-time migration seed.

## Corporate wallet transactions

Route: `GET /v1/corporations/{corporation_id}/wallets/{division}/transactions/`

- Implemented division: `1`.
- Supports the `from_id` cursor.
- The first request omits `from_id`; subsequent requests pass the oldest transaction ID from the preceding page.
- The returned cursor row is expected to repeat at the start of the next page. It is retained in raw evidence but deduplicated in normalized storage by `transaction_id`.
- Stop the historical scan when only the repeated cursor remains. Reject a missing or non-progressing cursor rather than marking the scan complete.
- Transaction identifiers, journal references, timestamps, buy/sell flag, client, location, quantity, type, and unit price are preserved as source facts.
- ESI transaction history is a separate source with separate pagination and retention characteristics. The application does not claim an unlimited historical horizon.

The incremental collector uses the highest observed transaction ID as a high-water mark. It fetches newest-first until it reaches the previously committed high-water mark, then resumes the independent historical cursor if the backfill is incomplete.

## Corporate wallet journal

Route: `GET /v4/corporations/{corporation_id}/wallets/{division}/journal/`

- Implemented division: `1`.
- Requires page-based pagination and the `X-Pages` response header.
- The collector reads page 1, captures the announced page count, then fetches all remaining pages.
- If `X-Pages` changes during a run, the journal source is marked incomplete and the overall wallet sync is partial.
- The journal exposes a rolling 30-day window; polling must be continuous to preserve events before they age out.
- Journal entries are not assumed to correspond one-to-one with market transactions.

## Corporate wallet balances

Route: `GET /v1/corporations/{corporation_id}/wallets/`

- Balance is captured as a point-in-time observation.
- The complete response is preserved as raw evidence; only division 1 is normalized into the wallet snapshot table.
- A current balance is never converted into a synthetic historical balance series.

## Request and response evidence

Each successful response records:

- endpoint, query parameters, page or cursor, HTTP status, and retrieval time;
- ETag, Last-Modified, Expires, X-Pages, and ESI error-budget headers when present;
- exact response body and SHA-256 digest.

Raw response rows are append-only at the database layer. Numeric JSON lexemes are parsed losslessly as strings and written to PostgreSQL `NUMERIC` columns, avoiding IEEE-754 conversion for ISK values and large IDs.

## Contract references

- [ESI overview and compatibility dates](https://developers.eveonline.com/docs/services/esi/overview/)
- [ESI API Explorer](https://developers.eveonline.com/api-explorer)
- [EVE SSO Authorization Code and PKCE, JWT validation](https://developers.eveonline.com/docs/services/sso/)
- [SSO endpoint deprecations and native PKCE requirements](https://developers.eveonline.com/blog/sso-endpoint-deprecations-2)
