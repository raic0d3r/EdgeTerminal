# Edge Terminal — integration-ready starter

Responsive Next.js dashboard starter for a metals trading analytics product.

## Current implementation status

- Responsive dashboard UI and sample chart visualization are included.
- `GET /api/market?symbol=XAU%2FUSD&interval=5min` now uses an explicit mode:
  - `MARKET_DATA_MODE=demo` returns null prices with `status: "demo"`.
  - `MARKET_DATA_MODE=live` calls Twelve Data for a price and historical candles.
  - If the provider fails, the endpoint returns `status: "unavailable"` and does not substitute sample prices.
- `GET /api/calendar` uses explicit `ECONOMIC_DATA_MODE`; demo mode returns an empty event list with a disclaimer. Live mode makes a Trading Economics calendar request with server-side credentials.
- `supabase/schema.sql` contains a starting profile/subscription/trade-journal schema with RLS policies.

**This is not yet a production-ready subscription platform.** Stripe checkout/webhooks, complete Supabase auth, real-time browser streaming, provider entitlements, AI, and final provider-response validation still need implementation and testing.

## Run locally

Requires Node.js 20.9+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Visit http://localhost:3000.

## Start in safe demo mode

Keep these values until your provider credentials and commercial rights have been confirmed:

```dotenv
MARKET_DATA_MODE=demo
ECONOMIC_DATA_MODE=demo
```

The market API returns `null` for unavailable prices rather than inventing quotes. Calendar demo mode returns no fabricated events.

## Enable provider integrations

1. Create an account and confirm that your plan covers XAU/USD, XAG/USD, the required candle intervals, history depth, rate limits, and public/commercial redistribution.
2. Add `TWELVE_DATA_API_KEY` to `.env.local`; keep it server-only.
3. Verify symbols and response fields for your exact subscription. The current adapter uses the documented `/price` and `/time_series` endpoints.
4. Confirm the correct Trading Economics API credentials, access plan, and public website redistribution rights. Add `TRADING_ECONOMICS_API_KEY` and `TRADING_ECONOMICS_API_SECRET`.
5. Set each mode to `live` only for the provider that has been tested. If a request fails, the endpoint returns an unavailable/error state rather than displaying fake data as live.

Never commit `.env.local`, and never expose a secret through a `NEXT_PUBLIC_` variable.

## Monthly Stripe billing — next implementation

- Create one recurring monthly Stripe Price for the PRO tier.
- Create a server-side checkout session only for the authenticated user.
- Verify webhook signatures using the raw request body.
- Handle at least `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and payment-failure events as appropriate to the integration.
- Store subscription state from verified webhook events; never trust a client-submitted plan or redirect URL as proof of payment.
- Check entitlements server-side on every protected API/action. Test cancellation, renewal, failed payments, refunds and duplicate/out-of-order webhook events.

## Supabase

Use `supabase/schema.sql` as a starting point in a development project. Review all RLS rules before launch. Subscription rows must only be modified by a trusted backend/webhook. Keep the Supabase service-role key server-side.

## Production checklist

- [ ] Commercial data license and symbol mapping confirmed
- [ ] API quotas, update frequency, timestamps, and stale-data handling tested
- [ ] Economic calendar fields/time zones and revisions validated
- [ ] Stripe monthly plan and signed webhook lifecycle tested
- [ ] Supabase auth, RLS, profile creation and account deletion implemented
- [ ] PRO entitlement enforced server-side
- [ ] Demo/live/unavailable states visible in the UI
- [ ] AI analysis uses validated, timestamped inputs and is labeled as uncertain
- [ ] Terms, privacy, support contact and financial risk disclosures published


## TradingView chart integration

The Overview chart now embeds TradingView's public Advanced Chart widget and switches between `OANDA:XAUUSD` and `OANDA:XAGUSD` when the asset tabs change. The selected UI timeframe maps to the widget interval.

Important:
- This is an embedded chart, not a raw market-data API. It does not automatically provide prices to your own cards, alerts, analytics, or backend.
- Symbol availability, delayed/live status, and market data depend on TradingView and the selected feed.
- Review TradingView's current widget terms and the relevant data-provider licensing terms before commercial launch, especially for a paid subscription product.
- The summary cards and economic calendar in this starter still contain demo/sample content and should not be represented as live data.


## TradingHelp365-inspired UI redesign

The dashboard layout has been redesigned to follow the supplied visual reference: narrow icon rail, breaking-news ticker, asset/timeframe controls, market-status banner, session tiles, combined TradingView chart + risk calculator, and expandable feature rows. The brand and implementation are original; this is not a pixel-perfect copy.

The TradingView chart is an embedded widget. Price cards/data feeds, actual economic news, login, VIP/PRO entitlement enforcement, and production billing are not implemented by this UI redesign. Market session times and ticker headlines are sample UI content and must be replaced with verified sources before launch. Check TradingView widget and market-data licensing before commercial use.


## Tool Manager drawer

Click the hamburger button in the far-left rail to open the Tool Manager drawer. It overlays and blurs the page, lists dashboard modules with checkboxes, lets users hide/show the module accordion rows, and provides Jump actions that scroll to the selected section. The Trading Chart entry jumps to the chart panel.


## Main sidebar

Added a community/navigation sidebar alongside the Tool Manager. It includes Edge Terminal branding, search, expandable Quick Actions, FAQ/support/install/documentation/feature suggestion links, Log Out placeholder, Terminal and AI/VIP/Groups cards, direct-message placeholders, and a profile/settings footer. The far-left hamburger toggles the main sidebar; the sliders icon opens/closes Tool Manager. These are UI placeholders; authentication, messaging, and help links need real destinations before production.


## Expanded full-dashboard module layouts

Expanded sections now have differentiated UI layouts: locked VIP/PRO panels, a trade-journal entry form, a confluence/scenario workspace, COT sentiment placeholders, liquidity/delta placeholders, and a correlation matrix. These are interface prototypes only; demo bars and blank states are explicitly labeled and do not represent live institutional data, signals, probabilities, or trade recommendations. Saving journal entries and provider integrations remain future work.


## Quick Actions menu update

The expandable Quick Actions section now contains only FAQs, Support & Feedback, Install App, Documentation, and Feature Suggestions. The Open Risk Calculator, Open Trading Chart, and Create Price Alert items have been removed from that submenu.


## VIP Area and Groups expandable sections

The sidebar's VIP Area expands to show VIP Lounge and Important VIP. Groups expands to show General Silver and General Gold. Entries have the labels and subtitles from the supplied reference screenshots. The destinations currently show a placeholder notice because real community/chat routes and VIP access control have not yet been implemented.


## Group chat with local SQLite

- Clicking **General Silver** or **General Gold** opens a conversation panel in the main workspace.
- Messages are read/written through `app/api/chat/route.ts` and persisted in `data/edge-terminal.sqlite`.
- The app seeds a few clearly generic sample messages into each room on first database initialization.
- Install the added dependency once in this project folder with `npm.cmd install`, then run `npm.cmd run dev`. Normal code edits do not require reinstalling npm packages or restarting the dev server in most cases.
- SQLite is ideal for local development and a single-machine demo. For a public multi-instance deployment, a local file may not be durable or shared across instances; use a persistent disk or a hosted database then.
- This is a prototype: messages currently use the temporary display name “Edge User”, there is no authentication, permissions, moderation, rate limiting, file uploads, or private messaging. Do not expose this version publicly with sensitive or private conversations.


## Private Notes and Support Inbox

- **Message yourself / Private Notes** are saved in browser local storage under the signed-in Firebase UID. They are not sent to the server or shared with other members. They are local to that browser/device and are not encrypted against someone with access to the same browser profile.
- **Support** creates a private one-to-one thread. The server verifies the Firebase ID token and derives the member's UID from the token; a member cannot choose another user's thread. Only that member and allowlisted administrators can read the thread.
- **Support Inbox** is shown to admins and lets them reply to each member's private ticket. Configure both `ADMIN_EMAILS` and `NEXT_PUBLIC_ADMIN_EMAILS` as comma-separated lists containing the same administrator emails. `ADMIN_EMAILS` is the server-side access control; the `NEXT_PUBLIC_` value only controls whether the link is shown.
- Support messages are stored in `data/edge-terminal.sqlite` on the application server. This is suitable for a single local server; production deployments with multiple instances/serverless hosting should use a shared durable database and equivalent row-level authorization. Back up the database and protect server access.
- The support API requires Firebase Admin credentials via `FIREBASE_SERVICE_ACCOUNT_KEY` or `GOOGLE_APPLICATION_CREDENTIALS`. Never expose service-account keys in client code or public environment variables.

## VIP community rooms

The sidebar VIP Area contains VIP Lounge and Important VIP for accounts whose Firestore `users/{uid}` profile has `role: "vip"`, `access.vipLounge: true`, or `access.importantVip: true`. Administrators configured through `ADMIN_EMAILS` are also allowed. The `/api/chat` endpoint checks this permission on every read and send; hiding the links in the UI is not the security boundary. Grant/revoke VIP membership using the admin user management panel and verify with a normal member account before deployment.


## Institutional Liquidity Heatmap
A separate heatmap module is available in the dashboard. It renders a time-price activity heatmap from candle/tick-volume proxies and marks potential swing-stop areas. It does not claim to provide real Level 2 order-book depth or actual resting institutional orders.

## cTrader UID-bound sessions
See `CTRADER-UID-SESSION-MIGRATION.md` for the OAuth/session migration, required `CTRADER_TOKEN_ENCRYPTION_KEY`, deployment steps, and two-user isolation tests.


## Market Intelligence — historical analysis milestone

The Market Intelligence module is available in the dashboard feature list. It reuses the authenticated `GET /api/market` broker data route for cTrader and Exness candles (XAU/USD and XAG/USD); the new analysis route forwards the existing Firebase bearer token and cTrader session cookie rather than creating another broker connection.

The analysis engine currently includes:
- Five-candle OHLC-shape similarity search over available historical bars.
- Confirmed swing pivots, basic bullish/bearish/range structure and sweep/reclaim detection.
- Higher-timeframe structure alignment fetched from the same broker candle API where a higher interval is supported (for example, M15 to H4 or H4 to D1).
- Pivot-candle supply/demand areas.
- Historical forward-outcome labels using a 1.5R target and 1R stop over a 12-bar horizon. Ambiguous same-candle target/stop hits are counted conservatively as losses; unresolved cases are kept separate.
- BUY/SELL/WAIT, illustrative entry/stop/target levels, evidence, confidence ceiling and uncertainty notes.

The dashboard also optionally reads the existing `/api/orderflow/absorption` pipeline when the signed-in user has access to the Order Flow Footprint feature. If that VIP-gated data is unavailable, candle-based analysis continues without it. Stored trade-print provenance is shown as returned by that endpoint; synthetic demo records are not promoted to live exchange flow.

Important limitations: this is an initial heuristic research engine, not a trained or calibrated AI model. Broker candles are account-specific and their volume may be tick volume. Historical match statistics are based only on the returned candle window, can be sparse, and are not evidence of future profitability. Validate across longer out-of-sample datasets, multiple market regimes, spread/slippage and broker-specific contract conditions before using forecasts. No order placement, auto-trading or notifications are implemented.

Run the added contract tests with `npm run test:market-intelligence`. The normal project build remains `npm run build`.

### Market Intelligence walk-forward validation

Market Intelligence now requests up to 500 broker candles (subject to broker history availability) and displays a separate walk-forward breakout benchmark alongside the nearest-pattern comparison. The benchmark uses a 20-bar prior high/low breakout, enters at the next candle open, applies a 1.5R target / 1R stop and a 12-bar maximum hold, skips overlapping positions, and counts same-candle stop/target ties as losses. It reports resolved win rate, expectancy, profit factor, and peak-to-trough drawdown in R. Unresolved positions are marked to the final available close and are reported separately. This benchmark is deliberately distinct from the live forecast rule and must not be interpreted as proof of future profitability; broker spread, commissions, slippage, and execution latency are not modeled.

### Market Intelligence v3 – multi-timeframe structure

- Market Intelligence now requests 5m, 15m, 1h, 4h and daily broker candles through the existing authenticated `/api/market` route. Missing intervals are reported as unavailable; no synthetic data is substituted.
- The forecast includes an independent swing-structure classification for each available interval. The multi-timeframe vote is deliberately capped and contributes only a small confluence adjustment.
- The structure panel labels confirmed close-through events as bullish/bearish BOS when aligned with the existing swing trend, or CHoCH when the break runs counter to that trend. A wick-only sweep is not labelled as a confirmed BOS/CHoCH.
- This is still candle-derived market structure, not institutional order-book or executed-volume data. The existing footprint pipeline is displayed separately and is not represented as live order flow unless actual stored trade prints are available.
- The API remains analysis-only and does not submit, modify, or close orders.


## Market Intelligence v5: broker-only spot analysis

Market Intelligence uses the selected cTrader or Exness spot-metal candle feed. No paid third-party market-data provider or additional API key is required. Broker-reported volume is treated as tick volume, not verified executed volume. The volume-bias display compares volume on bullish versus bearish candles and is explicitly a candle-direction proxy; it cannot identify the actual aggressor, prove how many traders are long or short, or reveal the broker's full client positioning. Stored trade-print records are reported separately and are not treated as live broker executions unless their source is independently verified.

The Market Intelligence liquidity map adds equal-high/low references, three-candle fair-value gaps, latest-candle displacement, and a candle-derived sweep check. These are OHLC inferences, not a view of actual resting orders or proof of institutional activity.

## Market Intelligence v6 — spot liquidity analysis

The v6 upgrade expands broker-candle analysis with ranked equal-high/equal-low liquidity references, recent sweep events with next-candle confirmation status, FVG strength and mitigation state, and candle-pattern order-block candidates (including breaker/mitigation status). These are transparent OHLC-derived proxies, not verified resting orders, institutional activity, or actual aggressor-side executions. Existing cTrader/Exness authentication, candle routing, and analysis-only behaviour are retained. No paid market-data provider or order execution is required.

Run `npm run test:market-intelligence` to execute the Market Intelligence contract and deterministic fixture tests.


## Market Intelligence v7 — liquidity-to-forecast confirmation

The v7 confirmation layer converts the existing broker-candle liquidity observations into a transparent setup checklist. It scores directional sweep/reclaim, displacement, a newly crossed BOS/CHoCH level, higher-timeframe structure, multi-timeframe agreement, and proximity to a directional FVG. BUY/SELL is permitted only when the score reaches 60/100, at least three checks align, a sweep or newly crossed structure level is present, and a matching displacement candle exists; otherwise the forecast remains WAIT. A BOS/CHoCH is now recorded only on the candle that crosses the confirmed swing level, rather than remaining active on every later candle above/below it. The checklist is a candle-derived analytical filter, not proof of institutional intent or a guarantee of outcomes. It does not place orders.

### Market Intelligence v8

- Adds a broker-candle-only liquidity-confirmation walk-forward backtest for the currently selected instrument and timeframe. It uses prior confirmed pivots, sweep/reclaim, directional displacement, and optional structure/trend/FVG evidence; entries are modeled at the next candle open, with a 2R target and 1R stop. Same-bar stop/target ties are losses, overlapping positions are skipped, and unresolved outcomes are marked to close.
- Adds conditional dynamic risk-planning levels from the latest candle close, confirmed swing structure and a median candle-range proxy: structural stop with a volatility buffer, plus 1R/2R/3R targets. When the live forecast is WAIT, these are explicitly conditional reference levels, not trade entries.
- Backtest results are for the selected broker, symbol and timeframe only. They do not include higher-timeframe confirmation, spread, commission or slippage, and should not be interpreted as live-strategy performance until validated against longer broker history.

## Market Intelligence v9 — strategy validation

Version 9 adds chronological development/holdout reporting, monthly summaries, illustrative R-based cost sensitivity, independent timeframe comparisons, and a same-broker XAU/USD versus XAG/USD comparison. Reports are based on the broker's available candle history (currently up to 500 bars per interval); small samples are explicitly labelled insufficient. Cost scenarios are illustrative, not measured spread/commission/slippage. See `MARKET-INTELLIGENCE-V9.md` for methodology and limitations.


## Market Intelligence v10 — broker-history pagination

- Market Intelligence requests up to 2,500 candles for the selected broker/instrument/timeframe.
- cTrader history is paginated in 500-bar count-based requests, stepping the `toTimestamp` cursor backwards and spacing requests to respect the historical-data request rate.
- Exness history is requested in adjacent, bounded 500-bar UTC windows using the account-specific Access Point.
- The engine now retains up to 2,500 selected-series candles for walk-forward validation rather than truncating the input back to 500.
- The dashboard discloses actual returned candle count, requested count and earliest returned bar.
- Multi-timeframe and alternate-instrument comparison requests remain capped at 500 bars each to limit concurrent broker load.
- Broker history can still be shorter than requested due to account entitlements, symbol availability, market sessions or provider retention. No bars or trades are synthesized.
- This remains analysis/backtesting only; no order execution was added.


## Market Intelligence v11 diagnostics

The liquidity-confirmation walk-forward report now includes descriptive breakdowns by bullish/bearish direction, UTC-derived candle-time session, recent market regime, exit reason (target/stop/time), and presence/absence of the structure-break, trend-alignment and FVG factors. These breakdowns reuse the same simulated historical trades; they do not create additional observations or improve the underlying strategy by themselves. Session labels assume candle timestamps are UTC and are explicitly marked for verification against the broker timestamp convention. Small subgroup samples are descriptive only.

## Market Intelligence v16 — entry-quality research

The v16 research panel compares eight pre-declared entry filters over one causal universe of broker-candle sweep/reclaim events: sweep/reclaim alone; sweep plus directional displacement; additional BOS, prior trend alignment, FVG, and/or a limited next-open chase filter. Every row uses next-bar-open entry, a shared structural/volatility stop, a fixed 1.5R target, the same maximum holding horizon, adverse-first same-candle stop/target handling, and non-overlapping trades per variant. The chronological 70/30 development/holdout split is unchanged. The panel reports development and holdout expectancy, holdout win rate/profit factor/drawdown, illustrative 0.10R net expectancy, and median displacement/entry-gap measures. A CSV export is available for the entry research table.

This is exploratory, single-timeframe research. Variants share candidates and are correlated; comparing many filters creates selection bias. The 0.10R cost is illustrative, not a measured cTrader/Exness spread, commission or slippage estimate. The study does not change the live forecast or execute trades. Holdout groups under 10 trades are labelled insufficient, 10–29 descriptive, and 30+ exploratory only; none of these labels establishes statistical significance or live profitability.


## Market Intelligence v17 — sweep quality research

The Entry Quality Research study now includes three pre-declared sweep-quality filters (shallow, balanced, strong) in addition to the existing eight entry variants. Sweep depth is wick penetration beyond the prior confirmed swing divided by the prior 20-bar median candle range; reclaim strength is the close back through the swept swing on the same scale. The table and CSV export include median sweep depth, median reclaim strength, and raw shared-universe counts of candidates/wins/losses excluded by each filter. These excluded counts are descriptive and are not a substitute for the non-overlapping strategy trade simulation. Results remain chronological 70/30 development/holdout, fixed 1.5R target, next-bar-open entry, adverse-first same-candle handling, and illustrative 0.10R cost. No live forecast or execution logic is changed.


## v44 Universal Push Notifications
See `PUSH-NOTIFICATIONS-v44.md` for VAPID setup, platform requirements, and the explicit background market-monitor limitation.
