# Master Scorecard price-level notifications

- Users arm or pause alerts from the Key Levels & Targets toolbar.
- Arming snapshots the current six support/resistance prices for the selected asset and swing/scalp mode. The snapshot remains fixed until the user pauses and re-arms it; changing the scorecard mode does not silently move existing alerts.
- Alert preferences and already-triggered level names are stored in browser localStorage per asset.
- While the scorecard page is open, each market-data refresh checks current-price crossings and newly expanded/latest candle high/low ranges against armed levels. Each level alerts once per arming; re-arm to reset it.
- If browser notification permission is granted, the page also issues an operating-system browser notification. An in-page status message is shown regardless.
- Browser notification permission is requested only after the user clicks Enable price alerts.

## Scope and limitations

This is page-active alerting, not server-side push. The browser must keep the EdgeTerminal page open and market data must continue refreshing. The current scorecard fetch cadence is 60 seconds, so this is not tick-by-tick and can miss a brief touch that occurs and reverses between refreshes. It does not notify while the browser/page is closed. Reliable closed-page/mobile push requires a service worker, Push API subscription, server-side push sender, and a continuously running price source; those are not part of this change.

Browser notification permission is controlled by the user and browser. Notifications are available only in supported secure contexts (HTTPS, with localhost generally treated as secure); persistent notifications while the page is closed require a service worker. See MDN's [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API) and [Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API).
