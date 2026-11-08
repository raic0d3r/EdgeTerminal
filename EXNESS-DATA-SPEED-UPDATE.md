# Exness data refresh improvements

- Toolbar quote refreshes every 3 seconds (previously 15 seconds).
- Footprint market data refreshes every 5 seconds (previously 60 seconds).
- Firebase ID tokens are reused from the SDK cache instead of forcing a token refresh on every market request.
- Exness account Access Point discovery is cached server-side for 30 minutes.
- Exness instrument lookup is cached server-side for 10 minutes.
- Historical candle responses are briefly cached (4 seconds) to avoid downloading the same 500-bar window on every quote refresh.
- Exness live tick wait timeout is reduced to 2.5 seconds, so a closed market falls back to the latest verified Exness candle close sooner.

The displayed quote remains Exness-only when Exness is selected. No cTrader or synthetic price fallback is introduced.
