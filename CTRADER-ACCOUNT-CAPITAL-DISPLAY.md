# cTrader account capital display

- Adds a server-side `kind=account` read using cTrader `ProtoOATraderReq` (2121) / `ProtoOATraderRes` (2122).
- Validates the selected account through the existing authenticated account guard.
- Converts broker balance using the account's `moneyDigits` value.
- Displays the value as currency-neutral account capital in the order ticket.
- Does not invent equity/free margin: standard ProtoOATrader data provides balance; equity is not returned in this response.
- Does not expose account credentials or tokens to the browser.

Build and verify against a connected demo/live account before production use.
