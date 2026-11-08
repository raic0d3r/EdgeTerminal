# cTrader local authentication test

This first integration stage adds the cTrader OAuth 2.0 account-access flow. It requests the `accounts` scope only (read-only; no trading permission).

## Local environment

Add these server-only values to `.env.local` (do not prefix them with `NEXT_PUBLIC_`):

```env
CTRADER_CLIENT_ID=your_application_client_id
CTRADER_CLIENT_SECRET=your_application_client_secret
CTRADER_REDIRECT_URI=http://localhost:3000/api/ctrader/callback
```

The exact redirect URI must also be registered in the approved cTrader Open API application. Restart `npm run dev` after changing environment variables.

## Test

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000/api/ctrader/status` and confirm `configured: true` and `connected: false`.
3. Open `http://localhost:3000/api/ctrader/connect` in the same browser.
4. Sign in to cTrader and approve the requested **accounts** permission.
5. You should return to the local app with `?ctrader=connected` in the address bar.
6. Open `http://localhost:3000/api/ctrader/status` again. It should report `connected: true`.
7. To clear the local app session, send `POST` to `/api/ctrader/disconnect` (or clear site cookies).

The authorization code is exchanged server-side. Access and refresh tokens are encrypted into an HttpOnly, SameSite=Lax cookie; they are not returned to browser JavaScript. The encryption key is derived from the server-only client secret, so changing that secret invalidates existing local sessions.

## Current scope / limitation

This stage verifies OAuth token acquisition only. It does **not yet** establish the cTrader Protobuf/WebSocket connection, list cTrader accounts, subscribe to XAUUSD/XAGUSD prices, or validate market depth/tick data. Those are separate steps after OAuth is confirmed. No trading scope or order-placement code is included.
