# Edge Terminal — Phase 5: Security Testing & Verification

## Scope and status

This phase adds a repeatable **static route inventory** and a verification plan. It does not certify the application, prove that every route is secure, or replace an independent penetration test. No production Firebase, Vercel, broker, or Upstash credentials are included or exercised by this package.

## 1. Run the static API inventory

From the project root:

```powershell
npm ci
npm run security:audit
```

The report scans `app/api/**/route.ts` and looks for common indicators of Firebase token verification, feature/admin authorization, rate limiting, same-origin checks, and bounded JSON parsing. These are **heuristics**. Review every route and every exported HTTP method manually. Public routes may intentionally omit authentication; protected routes must not.

## 2. Local quality checks

```powershell
npm run lint
npm run build
```

Record the full output. Do not deploy if either command fails. A successful build is not a security test.

## 3. Authorization test matrix

Use dedicated test accounts and non-production data. For every protected endpoint, test:

| Identity / condition | Expected result |
|---|---|
| No Firebase bearer token | 401 |
| Invalid, expired, or revoked token | Rejected (normally 401) |
| Disabled account | 403 |
| FREE calling PRO/VIP endpoint | 403 |
| PRO calling VIP endpoint | 403 |
| PRO calling PRO endpoint | Success, if otherwise valid |
| VIP calling PRO/VIP endpoint | Success, if otherwise valid |
| Non-admin calling admin endpoint | 403 |
| Admin with valid token calling admin endpoint | Success, if request is valid |

Do not use a real paying account or real broker orders for these tests.

## 4. Cross-user isolation tests

Create two test Firebase users (A and B), each with a separate broker connection and synthetic/test account where supported.

- A must not read, refresh, disconnect, or use B's cTrader session.
- A must not read, update, or disconnect B's Exness connection.
- Changing a UID/account ID in a request must not change the server-side owner identity.
- OAuth `state` must be unpredictable, bound to the initiating user/session, expire, and be single-use.
- API responses and logs must not contain access tokens, refresh tokens, passwords, or encryption keys.

Expected result for cross-user access: deny without disclosing whether the other user's resource exists.

## 5. Request and abuse tests

Run against local/staging only:

- Cross-origin mutation request: rejected where same-origin protection is required.
- Invalid `Origin`: rejected.
- Wrong content type for JSON endpoint: 415.
- Malformed JSON: 400.
- Non-object JSON body: 400.
- Body larger than configured limit: 413.
- Request count above configured limit: 429 with `Retry-After`.
- Redis unavailable/misconfigured in production mode: protected operation fails closed (503), never silently bypasses rate limiting.
- Confirm trusted proxy/IP headers are configured correctly; clients must not be able to spoof the identity key used for IP limits.

## 6. Firestore rules tests

Use the Firebase Emulator before production deployment. Verify ordinary users cannot write privileged fields such as `role`, `plan`, `status`, subscription entitlements, platform settings, or another user's documents. Verify server-side Admin SDK writes are intentional and protected by server authorization because Admin SDK bypasses Firestore rules.

## 7. Findings log

For each test, record: date, environment, route + method, test identity/tier, request (redact secrets), expected status, actual status, pass/fail, and remediation ticket. Never put bearer tokens, cookies, broker credentials, or Redis secrets in screenshots or logs.

## 8. Release gate

Do not deploy this security milestone to production until:

1. All route handlers and methods have an owner and intended access tier documented.
2. All authorization and cross-user tests pass.
3. Firestore Emulator tests pass.
4. Rate limiting is verified against the configured Redis database.
5. `npm run lint` and `npm run build` pass.
6. Staging smoke tests confirm login, dashboard, cTrader, Exness, market data, and subscriptions still work.
7. A rollback copy of the currently deployed version and Firestore rules is available.

A qualified independent security review is recommended before accepting payments.
