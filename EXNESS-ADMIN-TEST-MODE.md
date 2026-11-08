# Exness admin test mode

This project supports an optional server-side Exness credential set for testing.

1. Add the following to your local `.env.local` (or deployment environment):

   ```env
   EXNESS_TEST_MODE=true
   EXNESS_TEST_API_KEY=your_exness_api_key_identifier
   EXNESS_TEST_PRIVATE_KEY=your_private_signing_key
   EXNESS_TEST_ACCOUNT_ID=your_numeric_trading_account_id
   EXNESS_TEST_GATEWAY_URL=https://the-exact-gateway-from-exness-key-management
   ```

2. Ensure your signed-in admin email is listed in `ADMIN_EMAILS`.
3. Restart the Next.js server after changing environment variables.
4. Sign in as that admin and select Exness as the market-data provider. The Exness status endpoint verifies the test credentials, and the market endpoint uses them for that admin.

When `EXNESS_TEST_MODE` is not `true`, the existing per-user Firestore credential flow is unchanged. Even when test mode is enabled, non-admin users continue to use their own encrypted Firestore credentials. Test credentials are read only by server routes and are never returned to the browser.

This mode is read-only: it does not add or enable order execution. Use a dedicated test account and never place real credentials in client-side `NEXT_PUBLIC_` variables.
