# Edge Terminal — Production Security Phase 3

## Included in this phase

### Global HTTP response headers
`next.config.ts` now applies baseline headers to all routes: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, DNS-prefetch control, and HSTS. HSTS assumes the production site and all subdomains are HTTPS-only. If any subdomain is intentionally HTTP-only, remove `includeSubDomains` before deployment.

### Structured security event logger
`lib/server/security-audit.ts` adds a small structured logger that drops metadata keys likely to contain credentials or personal identifiers. It is a utility only; route-specific events must be added deliberately. Do not log raw request bodies, tokens, cookies, broker credentials, or full query strings.

## Important items deliberately NOT auto-enabled

- **Strict Content Security Policy:** not enabled because the app uses third-party charting, broker and other external resources. Build a CSP from the actual production resource inventory, deploy first as `Content-Security-Policy-Report-Only`, inspect reports, then enforce. A guessed strict policy can break charts or OAuth.
- **CSRF/origin enforcement:** not globally applied. Firebase Bearer-token API calls have a different CSRF profile from cookie-authenticated OAuth callbacks. Apply Origin/Referer checks to each cookie-authenticated state-changing route; preserve the cTrader OAuth callback's provider redirect and one-time state validation.
- **Input schemas/body-size limits:** must be added per endpoint based on its real payload contract. Do not blindly reject requests based on Content-Type or impose a generic tiny body limit; that can break existing trading payloads.
- **Audit event coverage:** logger is provided but must be called at security decision points. It does not create a durable audit trail by itself. Use a protected log sink for compliance-grade retention.

## Before deployment

1. Confirm production and all subdomains are HTTPS-only before keeping HSTS `includeSubDomains; preload`.
2. Run `npm ci`, `npm run lint`, and `npm run build`.
3. Test cTrader OAuth, chart embeds, Firebase sign-in, broker connections, and all API flows in a Preview deployment.
4. Inspect browser console/network for blocked resources after header changes.
5. Confirm no secrets are logged by application code or hosting logs.
6. Verify rate limiting still returns 429 and fails closed with 503 when Redis is unavailable.
7. Run authorization tests for FREE/PRO/VIP/ADMIN and cross-user broker isolation.

## Security status

This is a baseline hardening update, not a penetration test or security certification. The header changes are implemented in config; the logger is a reusable utility but not yet wired into every route. CSP, per-route CSRF protections, endpoint-specific validation, dependency vulnerability review, and end-to-end tests remain outstanding.
