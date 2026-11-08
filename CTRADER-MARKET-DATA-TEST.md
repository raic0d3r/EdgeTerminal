# cTrader live market-data test

## Install
Merge the `app/` and `lib/` folders into the Edge Terminal project. Keep the existing `.env.local` file and existing cTrader authentication/account-validation files.

## Run
Restart the Next.js development server, keep the same browser session that completed cTrader OAuth, then open:

`http://localhost:3000/api/ctrader/market-test`

The route selects the live account whose broker account linked to the user's cTrader authorization, authenticates that account with the existing `accounts` (view-only) token, lists symbols, subscribes to spot quotes and depth updates for exact XAUUSD/XAGUSD matches, samples for about seven seconds, and closes the WebSocket.

## Safety and interpretation
- This route sends only application/account authentication, symbol-list and market-data subscription requests. It does not contain any order-placement or position-modification request.
- Quote prices are decoded using cTrader's documented 1/100000 representation.
- cTrader quotes are broker-specific CFD prices, not a consolidated global spot feed.
- Bid/ask quote updates are not executed trade prints and do not establish aggressor-side volume.
- A depth subscription acknowledgement is not proof that depth events or a full order book were received.

The endpoint is a diagnostic sample, not a persistent streaming provider adapter. It should be tested locally before connecting anything to the dashboard.
