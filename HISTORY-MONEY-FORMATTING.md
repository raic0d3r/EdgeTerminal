# History money formatting update

History now shows three separate monetary columns for closed deals:

- Realized P&L: broker gross realized result, scaled by the cTrader account/deal `moneyDigits` (default 2 for the supplied account).
- Commission: broker commission, scaled by the same money precision.
- Net P&L: realized P&L + commission + swap when swap is supplied by the closing deal.

Values are formatted as signed currency, e.g. `+$8.73`, `-$0.03`, `+$8.70`. The UI uses the record currency when present and USD as the fallback for the supplied USD account. Build and broker verification are still required.
