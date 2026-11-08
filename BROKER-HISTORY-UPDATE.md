# Broker History Update

## Exness
- History requests include a bounded `from`/`to` window and `limit`.
- Cursor is passed through when supplied by the caller.
- The route returns the broker response and a normalized `records` array.

## cTrader
- Deal history uses `ProtoOADealListReq` (2133) / `ProtoOADealListRes` (2134).
- Requests are split into weekly time windows, with `maxRows: 1000`.
- `hasMore` causes the time window to be subdivided and re-queried, rather than silently discarding the truncated response.
- Duplicate deal IDs are removed and results are sorted newest first.
- Deal records retain original broker fields and include normalized `dealId`, `time`, `side`, `volumeUnits`, `price`, `commission`, `swap`, `pnl`, and `status` fields where available.
- The History tab presents a compact table instead of raw JSON.

## Limits and verification
- The history route remains scoped to the authenticated user's connected cTrader session and a linked account ID.
- The current cTrader UI requests the most recent 90 days.
- Very dense time windows that remain truncated after subdivision return an actionable error rather than silently incomplete history.
- This update has not been verified against a real broker account. `npm ci` timed out in the build environment, so a TypeScript/Next.js build could not be completed here. Test with the user's own demo account first, then their live account.
