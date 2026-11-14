export type BiasDirection = "Bullish" | "Bearish" | "Neutral";
export type BiasSnapshot = {
  asset: string;
  timeframe?: string;
  timestamp: string;
  price: number;
  bias: BiasDirection;
  score: number | null;
  sources: Array<{ key: string; bias: BiasDirection; active: boolean }>;
};
/** User-facing signal ledger: Neutral remains in research history but is not a trade signal. */
export function getDirectionalSignalHistory(history: BiasSnapshot[], limit = 8): BiasSnapshot[] {
  return history
    .filter(row => row.bias === "Bullish" || row.bias === "Bearish")
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, Math.max(0, limit));
}

export type HorizonStats = {
  horizonHours: number;
  matured: number;
  pending: number;
  awaitingPrice: number;
  correct: number;
  incorrect: number;
  flat: number;
  neutralSignals: number;
  neutralAverageAbsoluteReturnPct: number | null;
  directionalSignals: number;
  accuracy: number | null;
  averageSignedReturnPct: number | null;
  bullishSignals: number;
  bullishAccuracy: number | null;
  bearishSignals: number;
  bearishAccuracy: number | null;
  developmentSignals: number;
  validationSignals: number;
  validationAccuracy: number | null;
  validationAverageSignedReturnPct: number | null;
};
export type ValidationPriceObservation = { time: string; close: number };
export type BiasValidationReport = {
  snapshots: number;
  maturedOutcomes: number;
  horizons: HorizonStats[];
  methodology: string;
  limitations: string[];
  performanceTimeline: Array<{ date: string; horizonHours: number; accuracy: number | null; averageSignedReturnPct: number | null; samples: number }>;
};

const HORIZONS = [1, 4, 12, 24];

/** Keep one point per 15-minute bucket; callers persist this in browser-local storage. */
export function appendBiasSnapshot(history: BiasSnapshot[], next: BiasSnapshot, maxRecords = 10000): BiasSnapshot[] {
  if (!next.asset || !Number.isFinite(next.price) || next.price <= 0 || !Number.isFinite(Date.parse(next.timestamp))) return history;
  const sorted = [...history].filter(x => x.asset === next.asset && Number.isFinite(x.price) && x.price > 0 && Number.isFinite(Date.parse(x.timestamp))).sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const bucket = Math.floor(Date.parse(next.timestamp) / 900000);
  const last = sorted.at(-1);
  // Keep the first observation for each bias in a 15-minute bucket, but allow a
  // genuine direction change (Bullish ↔ Bearish) to create a fresh signal.
  if (last && Math.floor(Date.parse(last.timestamp) / 900000) === bucket && last.bias === next.bias) return sorted.slice(-maxRecords);
  sorted.push({ ...next, sources: next.sources.filter(s => s.active) });
  return sorted.slice(-maxRecords);
}

function stats(rows: Array<{ bias: BiasDirection; returnPct: number }>, horizonHours: number, pending: number, awaitingPrice: number): HorizonStats {
  const directional = rows.filter(r => r.bias !== "Neutral");
  const correctRows = directional.filter(r => (r.bias === "Bullish" && r.returnPct > 0) || (r.bias === "Bearish" && r.returnPct < 0));
  const flatRows = directional.filter(r => r.returnPct === 0);
  const incorrectRows = directional.filter(r => r.returnPct !== 0 && !correctRows.includes(r));
  const neutralRows = rows.filter(r => r.bias === "Neutral");
  const scored = (items: typeof directional) => items.length
    ? items.filter(r => (r.bias === "Bullish" && r.returnPct > 0) || (r.bias === "Bearish" && r.returnPct < 0)).length / items.length * 100
    : null;
  const signed = (items: typeof directional) => items.length
    ? items.reduce((sum, r) => sum + (r.bias === "Bullish" ? r.returnPct : -r.returnPct), 0) / items.length
    : null;
  const split = Math.floor(directional.length * 0.7);
  const validation = directional.slice(split);
  return {
    horizonHours, matured: rows.length, pending, awaitingPrice,
    correct: correctRows.length, incorrect: incorrectRows.length, flat: flatRows.length,
    neutralSignals: neutralRows.length,
    neutralAverageAbsoluteReturnPct: neutralRows.length ? neutralRows.reduce((sum, r) => sum + Math.abs(r.returnPct), 0) / neutralRows.length : null,
    directionalSignals: directional.length,
    accuracy: scored(directional), averageSignedReturnPct: signed(directional),
    bullishSignals: directional.filter(r => r.bias === "Bullish").length,
    bullishAccuracy: scored(directional.filter(r => r.bias === "Bullish")),
    bearishSignals: directional.filter(r => r.bias === "Bearish").length,
    bearishAccuracy: scored(directional.filter(r => r.bias === "Bearish")),
    developmentSignals: split, validationSignals: validation.length,
    validationAccuracy: scored(validation), validationAverageSignedReturnPct: signed(validation),
  };
}


export type SelectedTimeframeOutcome = {
  timestamp: string;
  targetTime: string;
  outcome: "Correct" | "Incorrect" | "Flat" | "Pending" | "Awaiting Price" | "Neutral · Up move" | "Neutral · Down move";
  returnPct: number | null;
  endPrice: number | null;
};

/** Evaluate each saved signal at the selected chart timeframe using completed candles. */
export function evaluateSelectedTimeframeOutcomes(
  history: BiasSnapshot[], asset: string, timeframe: string,
  prices: ValidationPriceObservation[], now = Date.now(),
): SelectedTimeframeOutcome[] {
  const minutes: Record<string, number> = {
    "1m": 1, "5m": 5, "10m": 10, "15m": 15, "30m": 30,
    "1h": 60, "4h": 240, "1d": 1440, "1w": 10080,
  };
  const duration = minutes[timeframe] || 15;
  const closeTimeFor = (time: string) => {
    const start = Date.parse(time);
    if (timeframe === "1mo") {
      const next = new Date(start);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next.getTime();
    }
    return start + (timeframe === "1w" ? 7 * 24 * 60 : duration) * 60_000;
  };
  const targetTimeFor = (time: string) => {
    const start = Date.parse(time);
    if (timeframe === "1mo") {
      const next = new Date(start);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next.getTime();
    }
    return start + (timeframe === "1w" ? 7 * 24 * 60 : duration) * 60_000;
  };
  const candles = prices
    .filter(p => Number.isFinite(Date.parse(p.time)) && Number.isFinite(p.close) && p.close > 0)
    .map(p => ({ closeTime: closeTimeFor(p.time), close: p.close }))
    .filter(p => p.closeTime <= now)
    .sort((a,b) => a.closeTime - b.closeTime);
  return history
    .filter(row => row.asset === asset && (row.timeframe || "15m") === timeframe && Number.isFinite(Date.parse(row.timestamp)) && row.price > 0)
    .sort((a,b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .map(row => {
      const target = targetTimeFor(row.timestamp);
      if (target > now) return { timestamp: row.timestamp, targetTime: new Date(target).toISOString(), outcome: "Pending" as const, returnPct: null, endPrice: null };
      const match = candles.find(c => c.closeTime >= target);
      if (!match) return { timestamp: row.timestamp, targetTime: new Date(target).toISOString(), outcome: "Awaiting Price" as const, returnPct: null, endPrice: null };
      const returnPct = (match.close / row.price - 1) * 100;
      const outcome = row.bias === "Neutral"
        ? (returnPct > 0 ? "Neutral · Up move" : returnPct < 0 ? "Neutral · Down move" : "Flat")
        : returnPct === 0 ? "Flat"
          : ((row.bias === "Bullish" && returnPct > 0) || (row.bias === "Bearish" && returnPct < 0)) ? "Correct" : "Incorrect";
      return { timestamp: row.timestamp, targetTime: new Date(target).toISOString(), outcome, returnPct, endPrice: match.close };
    });
}

/**
 * Evaluates saved, timestamped unified-bias snapshots against later observed prices.
 * A future observation must fall within a bounded tolerance after each horizon.
 * This is prospective snapshot validation, not a backtest reconstructed from today's feeds.
 */
export function evaluateBiasHistory(history: BiasSnapshot[], asset: string, now = Date.now(), timeframe?: string, brokerPrices?: ValidationPriceObservation[]): BiasValidationReport {
  const sorted = history.filter(x => x.asset === asset && (!timeframe || x.timeframe === timeframe || (!x.timeframe && timeframe === "15m")) && Number.isFinite(x.price) && x.price > 0 && Number.isFinite(Date.parse(x.timestamp)))
    .sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const horizons = HORIZONS.map(hours => {
    const rows: Array<{ bias: BiasDirection; returnPct: number; timestamp: string }> = [];
    let pending = 0;
    let awaitingPrice = 0;
    for (let i = 0; i < sorted.length; i++) {
      const start = sorted[i], target = Date.parse(start.timestamp) + hours * 3600000;
      if (target > now) { pending++; continue; }
      const tolerance = Math.max(90, hours * 0.25 * 60) * 60000;
      const brokerEnd = brokerPrices !== undefined
        ? brokerPrices.filter(point => Number.isFinite(Date.parse(point.time)) && Number.isFinite(point.close) && point.close > 0)
            .map(point => ({ time: Date.parse(point.time) + 60 * 60 * 1000, price: point.close }))
            .find(point => point.time >= target && point.time <= target + tolerance && point.time <= now)
        : null;
      const savedEnd = brokerPrices === undefined
        ? sorted.slice(i + 1).find(s => Date.parse(s.timestamp) >= target && Date.parse(s.timestamp) <= target + tolerance)
        : null;
      const endPrice = brokerEnd?.price ?? savedEnd?.price;
      if (endPrice == null) { awaitingPrice++; continue; }
      rows.push({ bias: start.bias, returnPct: (endPrice / start.price - 1) * 100, timestamp: start.timestamp });
    }
    return stats(rows, hours, pending, awaitingPrice);
  });
  const performanceTimeline = HORIZONS.flatMap(horizonHours => {
    const rows: Array<{ bias: BiasDirection; returnPct: number; timestamp: string }> = [];
    for (let i = 0; i < sorted.length; i++) {
      const start = sorted[i], target = Date.parse(start.timestamp) + horizonHours * 3600000;
      if (target > now) continue;
      const tolerance = Math.max(90, horizonHours * 0.25 * 60) * 60000;
      const brokerEnd = brokerPrices !== undefined
        ? brokerPrices.filter(point => Number.isFinite(Date.parse(point.time)) && Number.isFinite(point.close) && point.close > 0)
            .map(point => ({ time: Date.parse(point.time) + 60 * 60 * 1000, price: point.close }))
            .find(point => point.time >= target && point.time <= target + tolerance && point.time <= now)
        : null;
      const savedEnd = brokerPrices === undefined
        ? sorted.slice(i + 1).find(item => Date.parse(item.timestamp) >= target && Date.parse(item.timestamp) <= target + tolerance)
        : null;
      const endPrice = brokerEnd?.price ?? savedEnd?.price;
      if (endPrice != null) rows.push({ bias: start.bias, returnPct: (endPrice / start.price - 1) * 100, timestamp: start.timestamp });
    }
    const byDay = new Map<string, typeof rows>();
    rows.forEach(row => {
      const day = new Date(row.timestamp).toISOString().slice(0, 10);
      byDay.set(day, [...(byDay.get(day) || []), row]);
    });
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayRows]) => {
      const directional = dayRows.filter(row => row.bias !== "Neutral");
      const correct = directional.filter(row => (row.bias === "Bullish" && row.returnPct > 0) || (row.bias === "Bearish" && row.returnPct < 0)).length;
      const signed = directional.map(row => row.bias === "Bullish" ? row.returnPct : -row.returnPct);
      return { date, horizonHours, accuracy: directional.length ? correct / directional.length * 100 : null, averageSignedReturnPct: signed.length ? signed.reduce((sum, value) => sum + value, 0) / signed.length : null, samples: directional.length };
    });
  });
  return {
    snapshots: sorted.length,
    maturedOutcomes: Math.max(...horizons.map(h => h.matured), 0),
    horizons,
    performanceTimeline,
    methodology: `Prospective validation: snapshots of the live unified bias, selected instrument, selected timeframe and price are recorded locally at most once every 15 minutes per instrument/timeframe. ${brokerPrices !== undefined ? "Forward returns are matched to the first completed broker 1H candle close at or after each 1h, 4h, 12h and 24h target, within a bounded 90-minute-or-horizon tolerance." : "Forward returns use the first saved price observation at or after each target; broker candle history is not available for this evaluation."} The oldest 70% of matured directional observations are development; the newest 30% are chronological validation.${timeframe ? ` This report is filtered to ${timeframe}.` : ""}`,
    limitations: [
      "Collection starts when this version is installed; historical unified signals cannot be reconstructed from current COT, Sentmo and FRED readings.",
      "Snapshots are stored in this browser's local storage and are not shared across devices or browsers.",
      "Each selected chart timeframe is validated separately; older snapshots without a timeframe tag are only included in the legacy 15m history.",
      "Validation is provisional until each horizon has at least 30 directional observations; small samples are descriptive, not evidence of predictive edge.",
      "Zero-return directional observations are reported as flat, not correct or incorrect. Neutral forecasts are reported separately and excluded from directional accuracy.",
      brokerPrices !== undefined ? "Broker candle outcomes use the close of the first completed 1H candle at or after the forecast horizon; quote ticks are not treated as executed trades." : "Pending means the forecast horizon has not elapsed; awaiting price means no eligible future price observation was available within the allowed tolerance.",
      "No transaction costs, spreads, slippage or executable trade rules are modeled.",
    ],
  };
}
