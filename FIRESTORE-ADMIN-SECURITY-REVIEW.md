# Firestore and Admin Security Review

## Changes in this update

1. Firestore client registration is restricted to `role: member` and `status: active`.
2. Registration explicitly requires `access.vipLounge` and `access.importantVip` to be `false`, preventing self-grant of the two VIP flags through the client SDK.
3. Client-side updates and deletes of `/users/{uid}` remain denied. All other Firestore collections remain denied to client SDK access by the catch-all rule.
4. Both admin API routes now call `verifyIdToken(token, true)`, which checks Firebase token revocation as well as signature/expiry.
5. Admin feature-access responses are marked `private, no-store` / `no-store` to avoid caching configuration responses.

## Important trust boundary

The Firebase Admin SDK bypasses Firestore Security Rules. Therefore every server route using Admin SDK must independently authenticate the caller, authorize the operation, and validate ownership of any UID/resource supplied by the request. The rules in this file do not protect Admin SDK operations.

## Deployment

Deploy the updated `firestore.rules` to the same Firebase project used by Edge Terminal. Confirm the Firebase CLI project before deploying:

```bash
firebase projects:list
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

Do not deploy until the selected project ID is confirmed.

## Manual verification checklist

Use two ordinary test accounts and one allowlisted admin account:

- New member registration succeeds with `role=member`, `status=active`, VIP flags false.
- Attempt to register with `role=vip` is denied by Firestore rules.
- Attempt to register with `access.vipLounge=true` is denied.
- Attempt to register with `access.importantVip=true` is denied.
- A signed-in member cannot update their own role/access/status document.
- A member cannot read another user's `/users/{uid}` document.
- A member cannot read or write `platformSettings/featureAccess` directly through the client SDK.
- Admin API calls without a token return 401/403.
- Admin API calls with an expired/revoked token are rejected.
- An allowlisted admin with a valid, non-revoked token can use admin endpoints.

## Caveats / follow-up

- Admin identity is still based on the server-side `ADMIN_EMAILS` allowlist. Keep that environment variable tightly controlled and never expose it to client bundles.
- Admin promotion is intentionally blocked in `/api/admin/users`; add/remove administrators through trusted environment/deployment operations, not ordinary user management.
- Review every Admin SDK route separately. Firestore rules cannot compensate for a missing server-side authorization check.
- If the registration form changes its default access map, update the rules and tests together.
- Run the Firebase Emulator Suite rules tests and the project's lint/build checks before production deployment.
