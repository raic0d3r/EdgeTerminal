# Broker API Security Audit — Edge Terminal

## Scope
Reviewed cTrader OAuth/session routes, Exness connection routes, and the shared market-data route in this archive. This is a source review, not a penetration test or production verification.

## Findings

### Critical: cTrader OAuth session is browser-global, not Firebase-user-bound
`lib/ctrader/session.ts` stores the encrypted access/refresh token pair in a single `edge_ctrader_session` cookie. `getFreshCTraderSession()` reads only that cookie and does not establish which Firebase UID owns it. The cTrader status, accounts, market-test, and market-data routes therefore rely on a browser cookie rather than a user-bound broker connection record. If users change accounts in the same browser context, the cTrader session can be reused by the currently signed-in account.

**Required remediation before production:** replace the browser-global cTrader token cookie with a server-side encrypted credential record under `users/{uid}/brokerConnections/ctrader`; require a verified Firebase ID token on status/accounts/market-test/market/disconnect; bind the OAuth state transaction to the initiating UID; in the callback, validate and consume that state and store the token pair against that UID. Keep access/refresh tokens out of browser-readable storage and responses. Update the CONNECT UI to start OAuth using an authenticated POST/fetch flow rather than a plain anchor.

### High: cTrader routes lack consistent Firebase authentication
`/api/ctrader/status`, `/accounts`, `/market-test`, `/disconnect`, and the cTrader branch of `/api/market` currently do not verify a Firebase ID token. Cookie-based OAuth alone is not a sufficient account ownership boundary.

### Positive: Exness data is scoped by Firebase UID
Exness credentials are stored at `users/{uid}/brokerConnections/exness`, and the market route reads only the authenticated user's document. Connect also writes to that UID-specific path. This is the correct ownership pattern.

### Hardening applied in this revision
Exness routes and Exness market-data access now call `verifyIdToken(token, true)` so revoked Firebase sessions are rejected as well as invalid/expired tokens. This does not replace rate limiting, audit logging, or entitlement checks where those are required.

## Important deployment note
Do not consider cTrader ownership fixed by this revision. The cTrader cookie architecture needs the full UID-bound OAuth migration described above. Do not deploy live trading functionality on the assumption that this audit alone closes that issue.

## Manual test matrix after the cTrader migration
1. User A connects cTrader; User A can read only User A's accounts.
2. User B signs in in the same browser; User B sees disconnected and cannot reuse User A's token.
3. User A's revoked Firebase token receives 401 on every protected broker route.
4. Missing/invalid OAuth state is rejected and cannot attach a token to any UID.
5. Disconnect deletes only the authenticated user's broker connection.
6. API responses never contain access tokens, refresh tokens, or encrypted credential blobs.
