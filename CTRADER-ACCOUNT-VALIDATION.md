# Edge Terminal — cTrader live account validation

This incremental patch adds a server-side account-list test after the existing OAuth connection has been completed.

## Included

- `lib/ctrader/openapi-json.ts`: short-lived JSON WebSocket client for cTrader's documented live endpoint (`wss://live.ctraderapi.com:5036`). It sends application authentication (`2100`) followed by account-list request (`2149`) and expects the corresponding responses (`2101`, `2150`).
- `app/api/ctrader/accounts/route.ts`: authenticated local API route that returns the linked account list without exposing access or refresh tokens.

## Apply

Copy the `app` and `lib` folders from this patch into the root of your existing Edge Terminal project, merging folders and keeping existing files. Do not replace `.env.local`.

No new package is required: the project already includes `ws`.

## Test

1. Stop and restart the local Next.js server (`Ctrl+C`, then `npm run dev`).
2. In the same browser where cTrader OAuth completed, open:
   `http://localhost:3000/api/ctrader/accounts`
3. Check the returned `environment`, `accountCount`, and `accounts` fields.
4. Confirm the intended cTrader account has `isLive: true` and the broker label is consistent with broker.

The endpoint only lists accounts. It does not authenticate a specific account session, request symbols, subscribe to prices, or place/modify orders. If the list contains multiple accounts, choose the intended cTrader account before the next integration stage.

## Notes

- Live endpoint: `wss://live.ctraderapi.com:5036` (JSON over WebSocket).
- The official cTrader flow requires application authentication before `ProtoOAGetAccountListByAccessTokenReq`.
- `accounts` is the view-only scope; it does not permit trading operations.
