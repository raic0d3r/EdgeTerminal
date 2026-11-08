# Edge Terminal — Market Replay milestone

## What's included
- `GET /api/orderflow/replay?instrument=GC` (or `SI`) returns stored trades in timestamp order.
- Optional `from` and `to` query parameters accept Unix timestamps in milliseconds. The range is limited to 7 days and the response to 5,000 trades.
- A Market Replay panel is added inside the existing Order Flow Footprint accordion.
- Replay controls: load history, play, pause, reset, scrubber, and 1x/2x/5x/10x stepping.
- Footprint, delta/CVD, and volume profile/value area are recalculated from the prefix of trades revealed by replay.

## Install
1. Back up your current project.
2. Merge these files into the matching paths in your current project (do not replace your local environment file or database):
   - `app/api/orderflow/replay/route.ts`
   - `components/order-flow-market-replay.tsx`
   - `app/page.tsx`
   - `app/globals.css`
3. Run `npm install` if dependencies are not installed, then `npm run build`.
4. Start with `npm run dev`, open the Order Flow Footprint accordion, then click **Load history** in Market Replay.

## Notes
- Replay only shows records already saved in the existing SQLite `orderflow_trades` table.
- The demo provider currently creates a fresh synthetic batch when `/api/orderflow?instrument=GC` or `SI` is called. Call that endpoint to generate records before loading replay if the selected time range is empty.
- Synthetic data is not exchange data and must not be used for trading decisions.
- Replay is capped at 5,000 trades per request to keep browser-side recalculation responsive.
