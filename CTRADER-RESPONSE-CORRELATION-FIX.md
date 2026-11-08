# cTrader response-correlation fix

This patch updates only `lib/ctrader/market-probe.ts`.

The previous market probe required every cTrader response to echo `clientMsgId`.
The account-list implementation already tolerated responses without that field.
This patch safely correlates untagged responses by their expected `payloadType`
because the probe sends one request at a time. Responses that include a
`clientMsgId` still require an exact match.

## Install
1. Stop `npm run dev` with Ctrl+C.
2. Extract this ZIP into the project root and merge/overwrite the `lib` folder.
3. Do not replace `.env.local`.
4. Run `npm run dev`.
5. Open `http://localhost:3000/api/ctrader/market-test`.

The patch does not change OAuth credentials, account selection, provider settings,
or trading permissions. It performs read-only authentication and market-data
subscriptions only. A successful response correlation still does not guarantee
the broker sends live spot or depth updates.
