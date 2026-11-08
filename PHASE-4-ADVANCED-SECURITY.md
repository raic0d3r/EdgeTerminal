# Edge Terminal — Phase 4 Advanced Application Security

## Changes in this phase

- Added `lib/server/request-security.ts` for bounded JSON parsing and same-origin checks on browser mutation requests.
- Applied the helpers to chat, support, feature-suggestion and Exness-connect POST handlers.
- Enforced JSON content type, object-shaped JSON, malformed-body rejection and explicit body-size limits.
- Validated Exness credential field types and lengths; gateway URLs must use HTTPS.
- Stopped returning raw Exness provider/server exception messages to clients. Detailed errors remain server-side in a limited log record.

## Why same-origin checks are not authentication

The origin check is defense-in-depth only. Firebase Bearer-token verification and endpoint authorization remain mandatory. Requests without an Origin header are allowed for non-browser clients, but still require the route's normal authentication.

## Before deployment

1. Run `npm ci`.
2. Run `npm run lint` and `npm run build`.
3. Test valid and invalid JSON, missing/wrong Content-Type, oversized payloads, cross-origin POSTs, and valid same-origin requests.
4. Test Exness connect with malformed fields and valid credentials in a non-production environment.
5. Verify normal chat, support, suggestions and Exness flows still work.

## Remaining work (not claimed as completed)

- Add schema validation to every remaining API route, especially cTrader OAuth callback, admin mutations and market-data query parameters.
- Review every SQLite query to confirm parameterized statements; do not rely on input filtering as SQL-injection protection.
- Add file-upload controls only if/where upload endpoints exist.
- Add dependency scanning in CI (`npm audit` plus a reviewed dependency update process).
- Add automated integration tests using Firebase Emulator and a Redis test instance.
- Complete CSP in report-only mode, inventory TradingView/broker origins, then enforce a tested policy.
- Review trusted proxy/IP handling for the actual Vercel deployment before relying on IP limits.

No live Firebase, Redis, broker or production penetration test has been performed as part of this archive preparation.
