# Unified Decision Engine — Performance Validation

## What is measured

The panel records only final, confirmed `BUY` and `SELL` decisions from the Unified Trading Decision Engine. `WAIT` is not counted as a trade signal. Each record is keyed by the exact instrument and selected chart timeframe, so XAU/USD 4h, XAG/USD 4h and XAU/USD 1h remain separate samples.

A signal is recorded once per selected-timeframe candle using the engine's latest candle timestamp and its forecast close. The prospective outcome is the first later candle close at or after one full selected-timeframe interval has elapsed. BUY returns are measured close-to-close; SELL returns are sign-inverted. Positive signed return is directionally correct, negative is incorrect, and zero is flat. Flat observations are excluded from directional accuracy and shown separately.

The report includes total signals, matured and pending observations, directional accuracy, average signed return, BUY accuracy, SELL accuracy, and a chronological holdout consisting of the newest 30% of matured outcomes.

## Sample labels

- **Insufficient:** fewer than 30 matured directional outcomes.
- **Developing:** 30–99 matured outcomes.
- **Measured:** at least 100 matured outcomes.

These labels describe sample size only. They do not imply a profitable or statistically significant edge.

## Storage and limitations

Snapshots and candle-close history are stored in browser `localStorage`. They are not shared between browsers or devices and are not uploaded to the server. Clearing browser storage removes this validation history. Collection begins after this version is installed; historical final unified decisions are not reconstructed from current feeds.

This is a prospective directional follow-through check, not an execution backtest. It does not model bid/ask spread, commission, slippage, fills, stop-losses, take-profits, position sizing, financing, or trade overlap. The one-bar horizon is a fixed research convention. Do not interpret accuracy as win rate or profitability for an executable strategy.

The existing Market Intelligence walk-forward strategy backtest remains a separate historical price-action research test. It must not be presented as historical performance of the full Unified Decision Engine because it does not replay timestamped COT, retail sentiment and macro inputs as they were known at each historical decision time.
