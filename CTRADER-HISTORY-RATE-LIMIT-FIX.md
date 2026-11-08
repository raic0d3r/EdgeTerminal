# cTrader history rate-limit fix

Changes in this update:
- Replaced the previous weekly history fan-out with one bounded `ProtoOADealListReq` for the requested 90-day window (up to 1,000 deals).
- Preserves `hasMore` and tells the UI when the result is capped, rather than issuing a burst of follow-up calls.
- Added 20-second server-side result caching and in-flight request coalescing per OAuth session/account/date range.
- Caches cTrader linked-account validation for 30 seconds to avoid opening an additional account-list WebSocket for every read.
- Maps rate-limit/throttle errors to HTTP 429 with `Retry-After: 10`.
- Avoids showing the misleading “No history returned” empty state when the request actually failed.

Notes:
- The UI's default range remains the last 90 days.
- If more than 1,000 deals exist in that period, the response indicates `hasMore` and asks the user to narrow the date range; it does not hammer the broker with automatic pagination.
- This package has not been verified against the user's live cTrader account. Dependency installation was interrupted in this environment, so a production build could not be completed.
