# cTrader UID-bound OAuth session migration

## What changed
- OAuth initiation is now `POST /api/ctrader/connect` and requires a Firebase ID token.
- A cryptographically random OAuth `state` is stored as a SHA-256 hash in the server-only `ctraderOAuthStates` collection with the initiating Firebase UID and a 10-minute expiry.
- The callback validates the browser state cookie and atomically consumes the matching one-time Firestore transaction. The returned cTrader token pair is encrypted and stored in `ctraderSessions/{firebaseUid}`.
- cTrader status, account, market-test and market-data requests load the session only after verifying the caller's Firebase ID token; no cTrader bearer tokens are stored in browser cookies or returned to clients.
- Refresh-token rotation is persisted against the same UID. Disconnect deletes only the authenticated user's session.
- Existing cTrader OAuth account-consent screen and account selection remain unchanged.

## Required deployment configuration
Set `CTRADER_TOKEN_ENCRYPTION_KEY` in every deployment environment. Use a dedicated random secret (at least 32 characters), not the cTrader client secret. Keep it stable across deployments so existing stored tokens remain decryptable. Example generation:

```bash
openssl rand -base64 48
```

Also ensure `FIREBASE_SERVICE_ACCOUNT_KEY` (or the supported server credential configuration), `CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET`, and `CTRADER_REDIRECT_URI` are configured. The cTrader redirect URI must exactly match the registered callback URL.

## Firestore
The server uses Admin SDK collections `ctraderOAuthStates` and `ctraderSessions`. The existing client Firestore rules deny client access to unspecified collections, which is the desired behavior. Do not add client read/write permissions for these collections.

## Frontend behavior
The connect control obtains the current Firebase ID token, calls the POST connect endpoint, then navigates to the returned cTrader authorization URL. Status polling also sends the Firebase ID token. Market-data fetches already use the authenticated `fetchMarketData` helper.

## Migration and rollout
1. Deploy the new server code and `CTRADER_TOKEN_ENCRYPTION_KEY` together.
2. Existing browser-cookie cTrader sessions are intentionally not imported because they are not reliably attributable to a Firebase UID. Users must reconnect once through the official cTrader consent page.
3. Remove old `edge_ctrader_session` cookies automatically on callback; users who do not reconnect may retain an inert legacy cookie until browser expiry.
4. Test with two separate Firebase users and distinct cTrader accounts. Verify each sees only their own accounts, then disconnect one and confirm the other remains connected.
5. Verify revoked Firebase ID tokens are rejected and expired OAuth state cannot be replayed.

## Important operational notes
- Back up and protect Firestore; Admin SDK access bypasses Firestore client rules.
- Keep encryption key stable. Rotating it requires a deliberate re-encryption migration of every stored session.
- Consider adding scheduled cleanup for expired `ctraderOAuthStates` documents (TTL policy on `expiresAt` if configured as a Firestore timestamp; currently it is milliseconds since epoch, so use a scheduled cleanup or change it to a Timestamp before enabling TTL).
- This change does not grant trading permissions beyond the scopes approved by the user at cTrader. Keep scope requests minimal.
