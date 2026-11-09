# Local EVE SSO authorization (native PKCE)

## Decision

EVE Ledger runs as a local desktop-side process. It therefore uses EVE SSO's **Authorization Code with PKCE (S256)** flow instead of embedding a confidential web-app client secret in a local configuration.

The application requests exactly one scope:

`esi-wallet.read_corporation_wallets.v1`

No character credentials are collected by EVE Ledger. Authentication and consent happen on CCP's EVE SSO pages.

## Application registration

Register/configure the EVE Developers Portal application as a native application and enable the corporation wallet read scope. The registered callback URL must exactly match `ESI_REDIRECT_URI`.

Default:

`http://127.0.0.1:3000/auth/callback`

The callback server:

- binds only to IPv4 loopback `127.0.0.1`;
- accepts only the configured callback path and exact origin;
- has a five-minute timeout;
- never listens on a LAN interface or public address.

If the port is already in use, change the port in `ESI_REDIRECT_URI` and register that exact URL in the EVE Developers Portal.

## Authorization request

The client discovers the authorization, token, and JWKS endpoints from:

`https://login.eveonline.com/.well-known/oauth-authorization-server`

It generates:

- a random 32-byte `state`;
- a random 32-byte PKCE verifier;
- an S256 challenge calculated from the verifier.

The authorization URL carries `response_type=code`, `client_id`, the registered `redirect_uri`, the single required `scope`, `state`, `code_challenge`, and `code_challenge_method=S256`.

## Callback and token exchange

The callback requires exactly one `state` and one authorization `code`. State is compared with a constant-time comparison before exchanging any code. SSO error responses or malformed/duplicate parameters fail closed.

The token request is `application/x-www-form-urlencoded` and contains:

- `grant_type=authorization_code`;
- the one-time `code`;
- `client_id`;
- the exact `redirect_uri`;
- the original `code_verifier`.

No HTTP Basic header or client secret is used in this native PKCE flow.

## Access-token verification

Before a refresh token is persisted, the access-token JWT must pass:

- RS256 signature verification using the public key selected by `kid` from the discovered JWKS;
- issuer validation for the EVE SSO issuer;
- audience validation requiring both this app's client ID and `EVE Online`;
- a future `exp` and a valid `nbf`, when present;
- a subject in `CHARACTER:EVE:<character-id>` form;
- an `scp` array containing `esi-wallet.read_corporation_wallets.v1`.

The metadata and JWKS are cached for five minutes. If the key ID is not found, the JWKS is refreshed once before rejecting the token.

## Refresh and storage

For native applications the refresh request is form-encoded and carries `grant_type=refresh_token`, `refresh_token`, `client_id`, and the wallet scope. No Basic client authentication is used.

Only the refresh token is persisted. It is encrypted with AES-256-GCM and stored in PostgreSQL; the short-lived access token remains in process memory. If CCP rotates the refresh token, the replacement is durably stored before the access token is returned to the ESI caller.

`ESI_REFRESH_TOKEN` remains an optional one-time local migration seed only. Normal authorization should use `npm run auth:login`.

## Operator workflow

1. Set the database URL, corporation ID, native app client ID, loopback redirect, and 32-byte encryption key in the local `.env`.
2. Apply schema migrations with `npm run db:migrate`.
3. Run `npm run auth:login` and complete the CCP SSO login and consent in the browser.
4. Confirm the terminal reports the expected EVE character.
5. Run `npm run sync:wallet`.

Never paste access tokens, refresh tokens, PKCE verifiers, client secrets from unrelated/confidential app registrations, or authorization codes into chat, issues, or logs.
