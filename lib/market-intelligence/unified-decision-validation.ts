export type UnifiedDecisionDirection = "BUY" | "SELL";
export type UnifiedDecisionSnapshot = {
  asset: "XAU/USD" | "XAG/USD" | "BTC/USD";
  timeframe: string;
  signalTime: string;
  price: number;
  direction: UnifiedDecisionDirection;
};
export type ValidationPrice = { time: string; close: number };
export type UnifiedDecisionOutcome = UnifiedDecisionSnapshot & {
  outcomeTime: string;
  outcomePrice: number;
  returnPct: number;
  signedReturnPct: number;
  correct: boolean;
};
export type UnifiedDecisionPerformance = {
  asset: string;
  timeframe: string;
  signals: number;
  matured: number;
  pending: number;
  correct: number;
  incorrect: number;
  flat: number;
  accuracy: number | null;
  averageSignedReturnPct: number | null;
  validationSignals: number;
  validationAccuracy: number | null;
  buySignals: number;
  buyAccuracy: number | null;
  sellSignals: number;
  sellAccuracy: number | null;
  status: "insufficient" | "developing" | "measured";
};

const TIMEFRAME_MS: Record<string, number> = {
  "1m": 60_000, "5m": 300_000, "10m": 600_000, "15m": 900_000,
  "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000,
  "1d": 86_400_000, "1w": 604_800_000,
};

export function mergeValidationPrices(existing: ValidationPrice[], incoming: ValidationPrice[], max = 5000): ValidationPrice[] {
  const byTime = new Map<string, ValidationPrice>();
  for (const row of [...existing, ...incoming]) {
    if (Number.isFinite(Date.parse(row.time)) && Number.isFinite(row.close) && row.close > 0) byTime.set(row.time, row);
  }
  return [...byTime.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).slice(-max);
}

export function appendUnifiedDecisionSnapshot(history: UnifiedDecisionSnapshot[], next: UnifiedDecisionSnapshot, max = 10000): UnifiedDecisionSnapshot[] {
  if (!Number.isFinite(Date.parse(next.signalTime)) || !Number.isFinite(next.price) || next.price <= 0) return history;
  if (history.some(row => row.asset === next.asset && row.timeframe === next.timeframe && row.signalTime === next.signalTime)) return history;
  return [...history, next].sort((a, b) => Date.parse(a.signalTime) - Date.parse(b.signalTime)).slice(-max);
}

/** One-bar-ahead, close-to-close prospective validation. It does not simulate fills, stops, costs or targets. */
export function evaluateUnifiedDecisionPerformance(
  snapshots: UnifiedDecisionSnapshot[], pricesByGroup: Record<string, ValidationPrice[]>,
): UnifiedDecisionPerformance[] {
  const groups = new Map<string, UnifiedDecisionSnapshot[]>();
  for (const row of snapshots) {
    const key = `${row.asset}|${row.timeframe}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [asset, timeframe] = key.split("|");
    const duration = TIMEFRAME_MS[timeframe] || 15 * 60_000;
    const prices = [...(pricesByGroup[key] || [])].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const outcomes: UnifiedDecisionOutcome[] = [];
    let pending = 0;
    for (const row of rows) {
      const signalMs = Date.parse(row.signalTime);
      let target = signalMs + duration;
      if (timeframe === "1mo") { const nextMonth = new Date(signalMs); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1); target = nextMonth.getTime(); }
      const matched = prices.find(point => Date.parse(point.time) >= target);
      if (!matched) { pending++; continue; }
      const returnPct = (matched.close / row.price - 1) * 100;
      const signedReturnPct = row.direction === "BUY" ? returnPct : -returnPct;
      outcomes.push({ ...row, outcomeTime: matched.time, outcomePrice: matched.close, returnPct, signedReturnPct, correct: signedReturnPct > 0 });
    }
    const correct = outcomes.filter(row => row.signedReturnPct > 0).length;
    const incorrect = outcomes.filter(row => row.signedReturnPct < 0).length;
    const flat = outcomes.filter(row => row.signedReturnPct === 0).length;
    const validationStart = Math.floor(outcomes.length * 0.7);
    const holdout = outcomes.slice(validationStart);
    const buys = outcomes.filter(row => row.direction === "BUY");
    const sells = outcomes.filter(row => row.direction === "SELL");
    const accuracy = (items: UnifiedDecisionOutcome[]) => { const scored = items.filter(row => row.signedReturnPct !== 0); return scored.length ? scored.filter(row => row.correct).length / scored.length * 100 : null; };
    const averageSignedReturnPct = outcomes.length ? outcomes.reduce((sum, row) => sum + row.signedReturnPct, 0) / outcomes.length : null;
    return {
      asset, timeframe, signals: rows.length, matured: outcomes.length, pending,
      correct, incorrect, flat,
      accuracy: accuracy(outcomes), averageSignedReturnPct,
      validationSignals: holdout.length, validationAccuracy: accuracy(holdout),
      buySignals: buys.length, buyAccuracy: accuracy(buys), sellSignals: sells.length, sellAccuracy: accuracy(sells),
      status: (outcomes.length < 30 ? "insufficient" : outcomes.length < 100 ? "developing" : "measured") as "insufficient" | "developing" | "measured",
    };
  }).sort((a, b) => a.asset.localeCompare(b.asset) || a.timeframe.localeCompare(b.timeframe));
}
