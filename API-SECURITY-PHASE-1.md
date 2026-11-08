# API Security Phase 1 — Authentication and Rate Limiting

## Changes in this package

- Selected authenticated API routes now verify Firebase ID tokens with revocation checking (`verifyIdToken(token, true)`): access, chat, support, feature access, and feature suggestions.
- Added `lib/server/rate-limit.ts`, a shared Upstash Redis REST fixed-window limiter.
- Added per-user write limits:
  - Chat: 20 writes per 60 seconds.
  - Support: 10 writes per 60 seconds.
  - Feature suggestions: 5 writes per 60 seconds.
- In production, protected write endpoints fail closed with HTTP 503 if Upstash is not configured or unavailable. In local development, rate limiting is disabled when credentials are absent.

## Required production configuration

Create a Redis database in Upstash and copy its REST URL and REST token into your deployment environment:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Set both for Production (and Preview if you test preview deployments). Never commit real values to `.env.example` or source control. Restart/redeploy after setting them.

## Deploy / test

1. Install dependencies with `npm ci`.
2. Set the two Upstash variables in your local `.env.local` for production-like local testing (do not commit `.env.local`).
3. Run `npm run lint` and `npm run build`.
4. Sign in and send chat/support/suggestion writes; confirm normal requests succeed.
5. Exceed each configured limit and confirm HTTP 429 with `Retry-After`.
6. Revoke a Firebase test user's refresh tokens, obtain/use a revoked ID token, and confirm these authenticated routes reject it.
7. Verify the same endpoints return 503 when Redis is unavailable in production mode; this is intentional fail-closed behavior.

## Scope and remaining work

This is a Phase 1 change, not a complete API security certification. Rate limiting currently covers authenticated write operations on chat, support, and feature suggestions. Add suitable limits to broker OAuth/connect, market-data, order-flow, and admin endpoints after reviewing their traffic patterns. Public analytics endpoints need IP-based limits and caching. Review all remaining routes for authorization, resource ownership, input validation, and response data leakage.

The limiter uses a per-user key after Firebase authentication. It does not replace edge/WAF IP-based abuse controls, CAPTCHA, or provider-specific quotas. The two Redis pipeline commands are issued together; expiry is refreshed on each request, giving a rolling-ish fixed-window behavior suitable as a first layer, not a precision billing counter.
