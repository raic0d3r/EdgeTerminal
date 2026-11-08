# Broker trading integration (demo-first)

This build adds authenticated broker trading routes and connects the Trading Terminal UI to them.

## cTrader
- OAuth now requests `accounts trading` permission. Users with an older accounts-only grant must reconnect and approve trading permission.
- The API re-fetches the OAuth-linked account list on each trading request and rejects any account marked live.
- Open positions and pending orders use `ProtoOAReconcileReq` (2124/2125); deals history uses `ProtoOADealListReq` (2133/2134); orders use `ProtoOANewOrderReq` (2106) and closes use `ProtoOAClosePositionReq` (2111).
- The browser must supply an account ID selected from the authenticated account list. The server independently verifies that it belongs to the connected cTrader ID and is a demo account.

## Exness
- Positions/snapshot and deals history are read from the account-scoped Exness endpoints.
- Market position open and position close are wired to Exness trading endpoints.
- Exness mutations are asynchronous. An HTTP/API acknowledgement is labelled `accepted_pending_confirmation`, not a fill.
- Execution is disabled unless `EXNESS_EXECUTION_ENABLED=true` and the connected account ID is included in `EXNESS_DEMO_ACCOUNT_IDS` (comma-separated). Configure this only after independently confirming those IDs are demo accounts. Do not add live accounts.
- Exness pending LIMIT/STOP orders are intentionally not exposed by this first integration; the UI only offers MARKET for Exness.

## Required local setup
1. Use Node 22 (per `.nvmrc`) and install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and fill the Firebase Admin credentials using the project's existing secure Firebase configuration approach, cTrader app ID/secret/redirect URI, and dedicated encryption keys.
3. Keep Exness execution disabled until the demo account ID is confirmed and allowlisted. Never commit `.env.local`, service-account JSON, or broker keys.
4. Restart the dev server after environment changes.
5. Reconnect cTrader so the new trading scope is granted. Select a demo account in the Trading Terminal.
6. Verify order submission, broker-side execution events, position refresh, close, and deal history on demo accounts before any production use.

## Important verification status
This integration is source-implemented but has not been tested against the user's live broker sessions or actual demo accounts in this environment. cTrader/Exness acceptance is not equivalent to a fill. Confirm the final execution state in the broker terminal and refresh positions/history. This project must remain demo-only until end-to-end testing is complete.
