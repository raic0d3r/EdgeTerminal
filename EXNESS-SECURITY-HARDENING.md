# Exness security hardening

## Changes in this update

- Exness connect, status, disconnect, and Exness market-data routes now call Firebase Admin `verifyIdToken(token, true)` so revoked sessions are rejected as well as invalid/expired tokens.
- The status and market-data routes return HTTP 401 for Firebase authentication failures rather than reporting them as generic upstream failures.
- The connect route maps Firebase authentication failures to HTTP 401.
- Exness credentials remain stored under `users/{firebaseUid}/brokerConnections/exness`; handlers derive the UID only from the verified Firebase token and never accept a UID from request input.

## Deployment and validation

1. Deploy the updated application with the existing Firebase Admin service-account configuration and Exness encryption key.
2. Sign in as two different Firebase users and connect a different Exness account for each.
3. Confirm each user's status and market-data requests only read their own `users/{uid}/brokerConnections/exness` document.
4. Revoke one user's Firebase refresh tokens using the trusted Admin SDK, then confirm their Exness connect/status/disconnect/market requests are rejected after their current ID token is revoked. A fresh sign-in should restore access.
5. Confirm a normal active user can still connect, read status, request market data, and disconnect.

## Notes

- This update does not change Exness API credentials, trading permissions, or account-selection behavior.
- It does not constitute a full penetration test or production build. Dependencies were not installed in this environment, so `npm run lint` and `npm run build` were not run.
- Continue to keep Exness encryption keys and Firebase service-account credentials in server-only environment/secret storage. Never expose them through `NEXT_PUBLIC_*` variables or client bundles.
