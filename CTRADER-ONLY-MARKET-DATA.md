# Edge Terminal — cTrader-only market data

This build uses the connected cTrader account as the sole market-data source.

- `/api/market` always serves cTrader.
- Supported instruments: `XAU/USD` and `XAG/USD`.
- Supported candle intervals: 1m, 5m, 15m, 30m, 1h, 4h and 1d.
- Historical OHLC candles are requested using cTrader trendbars.
- Live bid/ask is read from cTrader spot events.
- No BiQuote, iTick, XAUS, or demo fallback is used.
- The cTrader session is encrypted in an HTTP-only cookie; credentials remain server-side.

## Data limitations

cTrader trendbar volume is broker-reported tick volume. It is not verified executed trade volume. Spot bid/ask updates are quotes, not aggressor-side executions. Therefore, footprint buy/sell splits, delta and CVD derived from candle volume remain estimates. Depth subscriptions are not treated as working Level II data unless actual depth updates are received.

The market-data endpoint returns an explicit unavailable/error response if cTrader cannot supply the requested data. It does not silently switch providers.
