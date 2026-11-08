# PRO/VIP server-side authorization changes

## Implemented
- Added `lib/server/require-feature-access.ts`.
- Protected GET `/api/orderflow`, `/api/orderflow/absorption`, `/api/orderflow/history`, and `/api/orderflow/replay` with the configured `Order Flow Footprint` tier (VIP by default).
- Protected GET `/api/calendar` with the configured `Monetary Policy Watch & Macro Events` tier (PRO by default).
- Updated the existing browser clients for calendar, absorption, and replay to send Firebase ID tokens in the Authorization header.
- Authorization verifies the Firebase ID token (including revocation), reads the user's role/plan from the Firestore `users/{uid}` document, reads the live feature rules from `platformSettings/featureAccess`, and denies access on verification/configuration failures.

## Important deployment checks
1. Confirm that `ADMIN_EMAILS` is configured server-side and contains only trusted administrator email addresses.
2. Confirm that each user's authoritative `role` or `plan` field is set by trusted server-side code only. The supplied Firestore rules prevent client updates to user profiles; keep that protection.
3. Verify that `platformSettings/featureAccess` is maintained by the admin API and that feature titles exactly match `lib/feature-access.ts`.
4. Run `npm ci`, `npm run lint`, and `npm run build` in the deployment environment. Dependencies were not installed in the audit environment, so a full build has not been verified here.
5. Test with real FREE, PRO, VIP, and ADMIN Firebase accounts. Expected responses: no token = 401; insufficient tier = 403; authorized = normal endpoint response.
6. The `/api/orderflow` and `/api/orderflow/history` routes have been protected even though no direct component fetch for them was found in this source scan; any future caller must send `Authorization: Bearer <Firebase ID token>`.
7. Review other API routes separately. This patch does not claim to secure cTrader, Exness, correlation, confluence, or admin routes.

## Credential warning
The source archive contained `firebase-service-account.json`. It has been omitted from the patched archive. If that key is real or has ever been used, revoke it in Google Cloud IAM and create a replacement. Store the replacement in a server-only deployment secret such as `FIREBASE_SERVICE_ACCOUNT_KEY`; never commit or distribute it.
