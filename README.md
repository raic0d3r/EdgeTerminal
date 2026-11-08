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
