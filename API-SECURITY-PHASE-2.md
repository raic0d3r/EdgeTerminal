# Edge Terminal API Security — Phase 2

## Included
- Added IP-scoped Upstash Redis rate limits to cTrader connect/callback/accounts/status/disconnect/market-test routes.
- Added IP-scoped limits to Exness connect/status/disconnect and market data.
- Added IP-scoped limits to all four Order Flow endpoints and admin read/write endpoints.
- Added an additional Firebase-UID-scoped bucket to all four Order Flow endpoints after server-side entitlement verification.
- Uses the existing `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; no new package is required.
- Protected routes fail closed (503) if Redis is not configured or unavailable in production.

## Initial limits
| Scope | Limit | Window |
|---|---:|---:|
| cTrader connect | 5 | 10 min |
| cTrader callback | 10 | 10 min |
| cTrader accounts/status | 30 | 1 min |
| cTrader market test | 5 | 1 min |
| Exness connect | 5 | 10 min |
| Exness status | 30 | 1 min |
| Exness disconnect | 10 | 1 min |
| Market data | 60 | 1 min |
| Order Flow (per IP and per UID) | 60 | 1 min |
| Admin reads | 30 | 1 min |
| Admin writes | 15 | 1 min |

## Important implementation notes
- IP limits are an abuse-control layer, not an identity control. Authentication, UID ownership and feature authorization remain mandatory.
- On Vercel, `x-vercel-forwarded-for` is preferred. The `x-forwarded-for` fallback is intended for trusted reverse-proxy/local setups; do not expose the app behind an untrusted proxy that lets clients spoof forwarding headers.
- The existing limiter uses a Redis `INCR` + `EXPIRE` pipeline. This is a simple rolling-expiry counter rather than a mathematically exact fixed-window or sliding-window algorithm. If stricter fairness is needed, replace it with an atomic Lua/Upstash Ratelimit implementation.
- The cTrader OAuth callback is intentionally IP-limited because the provider redirects the browser and does not send the user's Firebase bearer token. The callback must continue validating the one-time OAuth state and transaction.
- Do not expose Redis credentials in client-side variables. Configure them only as server environment variables in Vercel.

## Deploy checklist
1. Ensure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set in Vercel for the target environment.
2. Run `npm ci`, `npm run lint`, and `npm run build` locally.
3. Test valid and invalid Firebase sessions, FREE/PRO/VIP/ADMIN behavior, and 429 responses.
4. Temporarily remove Redis credentials in a staging deployment and confirm protected endpoints return 503 (not success).
5. Deploy to Preview first, then Production after functional broker tests pass.

## Not a completed penetration test
This phase adds request throttling. It does not certify the app as production-secure. Continue reviewing all API handlers, especially OAuth callback state/cookie binding, broker token encryption/rotation, request payload validation, and provider-side quotas.
