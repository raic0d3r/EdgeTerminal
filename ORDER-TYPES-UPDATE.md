# Order type update

The order ticket now exposes six explicit choices: Buy Market, Sell Market, Buy Limit, Sell Limit, Buy Stop, and Sell Stop.

The selected side and execution type are routed separately to the broker APIs:
- Market: Exness `/positions` or cTrader MARKET order.
- Limit: Exness `/orders` with `type: limit` or cTrader LIMIT order.
- Stop: Exness `/orders` with `type: stop` or cTrader STOP order.

Pending orders require an entry price. The broker remains the final authority on current quote, stop-distance, instrument precision, volume step, margin, and trading-session validation. Broker acceptance is not confirmation of a fill.
