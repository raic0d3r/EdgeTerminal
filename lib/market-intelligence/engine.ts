import { runAdvancedValidation } from "@/lib/market-intelligence/advanced-validation";
import type { MarketCandle } from "@/lib/providers/market";

export type ForecastAction = "BUY" | "SELL" | "WAIT";
export type PatternMatch = {
  time: string;
  distance: number;
  outcome: "win" | "loss" | "unresolved";
  returnR: number;
};

export type MarketForecast = {
  action: ForecastAction;
  symbol: string;
  broker: "ctrader" | "exness";
  timeframe: string;
  generatedAt: string;
  currentPrice: number;
  entryZone: { low: number; high: number } | null;
  stopLoss: number | null;
  targets: number[];
  riskPlan: {
    status: "active" | "conditional" | "unavailable";
    direction: "bullish" | "bearish" | "neutral";
    entry: number | null;
    stop: number | null;
    targets: number[];
    riskDistance: number | null;
    methodology: string;
  };
  strategyBacktest: {
    trades: number; wins: number; losses: number; unresolved: number;
    winRate: number | null; expectancyR: number | null; profitFactor: number | null;
    maxDrawdownR: number;
    inSample: { trades: number; expectancyR: number | null; winRate: number | null };
    outOfSample: { trades: number; wins: number; losses: number; unresolved: number; expectancyR: number | null; winRate: number | null; profitFactor: number | null; maxDrawdownR: number; startTime: string | null; endTime: string | null };
    costSensitivity: Array<{ costR: number; netExpectancyR: number | null }>;
    monthly: Array<{ month: string; trades: number; wins: number; losses: number; expectancyR: number }>;
    tradeLedger: Array<{ id: number; sample: "development" | "out-of-sample"; signalTime: string; entryTime: string; exitTime: string; direction: "bullish" | "bearish"; entry: number; stop: number; target: number; outcome: "win" | "loss" | "unresolved"; returnR: number; session: string; regime: string; structureBreak: boolean; trendAligned: boolean; fvg: boolean }>;
    diagnostics: {
      byDirection: Array<{ label: string; trades: number; wins: number; losses: number; expectancyR: number | null; winRate: number | null }>;
      bySession: Array<{ label: string; trades: number; wins: number; losses: number; expectancyR: number | null; winRate: number | null }>;
      byRegime: Array<{ label: string; trades: number; wins: number; losses: number; expectancyR: number | null; winRate: number | null }>;
      byExit: Array<{ label: string; trades: number }>;
      byFactor: Array<{ label: string; trades: number; wins: number; losses: number; expectancyR: number | null; winRate: number | null }>;
      sessionTimezone: string;
    };
    researchVariants: Array<{
      name: string; rule: string; trades: number; developmentTrades: number; outOfSampleTrades: number;
      developmentExpectancyR: number | null; outOfSampleExpectancyR: number | null;
      outOfSampleWinRate: number | null; outOfSampleProfitFactor: number | null;
      outOfSampleMaxDrawdownR: number; outOfSampleNetExpectancyAt010R: number | null;
      status: "insufficient" | "descriptive" | "exploratory";
    }>;
    researchMethodology: string;
    riskSensitivity: Array<{ name: string; stopModel: "structural" | "atr"; targetR: number; trades: number; developmentTrades: number; outOfSampleTrades: number; developmentExpectancyR: number | null; outOfSampleExpectancyR: number | null; outOfSampleWinRate: number | null; outOfSampleProfitFactor: number | null; outOfSampleMaxDrawdownR: number; netExpectancyAt010R: number | null; status: "insufficient" | "descriptive" | "exploratory" }>;
    entryQuality: Array<{ name: string; rule: string; trades: number; developmentTrades: number; outOfSampleTrades: number; developmentExpectancyR: number | null; outOfSampleExpectancyR: number | null; outOfSampleWinRate: number | null; outOfSampleProfitFactor: number | null; outOfSampleMaxDrawdownR: number; netExpectancyAt010R: number | null; medianDisplacementAtr: number | null; medianEntryGapAtr: number | null; medianSweepDepthAtr: number | null; medianReclaimAtr: number | null; filteredOutCandidates: number; filteredOutWins: number; filteredOutLosses: number; status: "insufficient" | "descriptive" | "exploratory" }>;
    entryQualityMethodology: string;
    liquidityContext: Array<{ name: string; rule: string; trades: number; developmentTrades: number; outOfSampleTrades: number; developmentExpectancyR: number | null; outOfSampleExpectancyR: number | null; outOfSampleWinRate: number | null; outOfSampleProfitFactor: number | null; outOfSampleMaxDrawdownR: number; netExpectancyAt010R: number | null; status: "insufficient" | "descriptive" | "exploratory" }>;
    liquidityContextMethodology: string;
    advancedValidation: ReturnType<typeof runAdvancedValidation>;
    sampleAdequacy: "insufficient" | "limited" | "developing" | "larger-sample";
    methodology: string;
  };
  strategyByTimeframe: Array<{ timeframe: string; candles: number; trades: number; outOfSampleTrades: number; outOfSampleExpectancyR: number | null; outOfSampleWinRate: number | null; status: "available" | "insufficient" }>;
  strategyByInstrument: Array<{ symbol: string; candles: number; trades: number; outOfSampleTrades: number; outOfSampleExpectancyR: number | null; outOfSampleWinRate: number | null; status: "available" | "insufficient" }>;
  confidence: number;
  confirmation: {
    direction: "bullish" | "bearish" | "neutral";
    score: number;
    status: "confirmed" | "developing" | "weak";
    components: Array<{ name: string; points: number; maximum: number; state: "aligned" | "missing" | "opposed" }>;
    rationale: string[];
    rule: string;
  };
  validity: "valid" | "caution" | "insufficient";
  uncertainty: string[];
  structure: {
    trend: "bullish" | "bearish" | "range" | "unclear";
    higherTimeframeTrend: "bullish" | "bearish" | "range" | "unclear" | "unavailable";
    higherTimeframe: string | null;
    latestHigh: number | null;
    latestLow: number | null;
    explanation: string[];
    breakType: "bullish-bos" | "bearish-bos" | "bullish-choch" | "bearish-choch" | "none";
  };
  multiTimeframe: Array<{ timeframe: string; trend: "bullish" | "bearish" | "range" | "unclear"; candles: number; latestClose: number | null; status: "available" | "unavailable" }>;
  liquidity: {
    sweep: "buy-side" | "sell-side" | "none";
    explanation: string;
  };
  zones: Array<{ type: "demand" | "supply"; low: number; high: number; distancePercent: number }>;
  backtest: {
    trades: number;
    wins: number;
    losses: number;
    unresolved: number;
    winRate: number | null;
    expectancyR: number | null;
    profitFactor: number | null;
    maxDrawdownR: number;
    methodology: string;
  };
  historical: {
    samples: number;
    wins: number;
    losses: number;
    unresolved: number;
    winRate: number | null;
    averageR: number | null;
    matches: PatternMatch[];
    methodology: string;
  };
  evidence: string[];
  data: { source: string; mode: string; candles: number; latestCandle: string | null; oldestCandle: string | null; requestedCandles: number; note: string; quality: { rawCandles: number; validCandles: number; invalidOhlc: number; invalidTimestamp: number; duplicateTimestamps: number; outOfOrderTimestamps: number; missingVolume: number; volumeCoveragePercent: number; timezoneOffsetCoveragePercent: number; intervalMinutes: number | null; medianIntervalMinutes: number | null; internalGapCount: number; longClosureGapCount: number; maxGapHours: number | null; timestampAssumption: string } };
};

type Pivot = { index: number; price: number; kind: "high" | "low" };

const finite = (n: number) => Number.isFinite(n);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const candleRange = (c: MarketCandle) => Math.max(c.high - c.low, Math.abs(c.close - c.open), 1e-9);

function findPivots(candles: MarketCandle[], left = 3, right = 3): Pivot[] {
  const result: Pivot[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) result.push({ index: i, price: c.high, kind: "high" });
    if (isLow) result.push({ index: i, price: c.low, kind: "low" });
  }
  return result;
}

function patternVector(candles: MarketCandle[], end: number, length = 5): number[] {
  const start = end - length + 1;
  const window = candles.slice(start, end + 1);
  const scale = median(window.map(candleRange)) || 1;
  return window.flatMap((c) => [
    clamp((c.close - c.open) / scale, -3, 3),
    clamp((c.high - Math.max(c.open, c.close)) / scale, 0, 3),
    clamp((Math.min(c.open, c.close) - c.low) / scale, 0, 3),
    clamp(((c.close - c.low) / Math.max(c.high - c.low, 1e-9)) * 2 - 1, -1, 1),
  ]);
}

function distance(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

function evaluateOutcome(candles: MarketCandle[], index: number, horizon: number, risk: number): { outcome: PatternMatch["outcome"]; returnR: number } {
  const entry = candles[index + 1]?.open;
  if (entry == null || !Number.isFinite(entry) || risk <= 0) return { outcome: "unresolved", returnR: 0 };
  // Direction is measured from the pattern's final close to its next-bar entry.
  const direction = candles[index].close >= candles[index - 1].close ? 1 : -1;
  const target = entry + direction * risk * 1.5;
  const stop = entry - direction * risk;
  for (let j = index + 1; j <= Math.min(candles.length - 1, index + horizon); j++) {
    const c = candles[j];
    const hitTarget = direction > 0 ? c.high >= target : c.low <= target;
    const hitStop = direction > 0 ? c.low <= stop : c.high >= stop;
    // If both barriers occur in one candle, assume the adverse barrier first.
    if (hitStop && hitTarget) return { outcome: "loss", returnR: -1 };
    if (hitStop) return { outcome: "loss", returnR: -1 };
    if (hitTarget) return { outcome: "win", returnR: 1.5 };
  }
  const last = candles[Math.min(candles.length - 1, index + horizon)].close;
  const r = ((last - entry) * direction) / risk;
  return { outcome: "unresolved", returnR: Number.isFinite(r) ? clamp(r, -3, 3) : 0 };
}


function walkForwardBacktest(candles: MarketCandle[], lookback = 20, horizon = 12) {
  // A deliberately simple, reproducible breakout benchmark. Each signal uses
  // only candles available at that timestamp; entry is the following candle open.
  const trades: Array<{ outcome: "win" | "loss" | "unresolved"; r: number }> = [];
  let nextAllowed = lookback;
  for (let i = lookback; i < candles.length - 1; i++) {
    if (i < nextAllowed) continue;
    const prior = candles.slice(i - lookback, i);
    const ceiling = Math.max(...prior.map((c) => c.high));
    const floor = Math.min(...prior.map((c) => c.low));
    const direction = candles[i].close > ceiling ? 1 : candles[i].close < floor ? -1 : 0;
    if (!direction) continue;
    const entryIndex = i + 1;
    const entry = candles[entryIndex].open;
    const risk = median(candles.slice(Math.max(0, i - 13), i + 1).map(candleRange));
    if (!finite(entry) || !finite(risk) || risk <= 0) continue;
    const target = entry + direction * risk * 1.5;
    const stop = entry - direction * risk;
    let result: { outcome: "win" | "loss" | "unresolved"; r: number } = { outcome: "unresolved", r: 0 };
    const end = Math.min(candles.length - 1, entryIndex + horizon - 1);
    for (let j = entryIndex; j <= end; j++) {
      const c = candles[j];
      const hitTarget = direction > 0 ? c.high >= target : c.low <= target;
      const hitStop = direction > 0 ? c.low <= stop : c.high >= stop;
      if (hitTarget && hitStop) { result = { outcome: "loss", r: -1 }; break; }
      if (hitStop) { result = { outcome: "loss", r: -1 }; break; }
      if (hitTarget) { result = { outcome: "win", r: 1.5 }; break; }
      if (j === end) result = { outcome: "unresolved", r: clamp(((c.close - entry) * direction) / risk, -1, 1.5) };
    }
    trades.push(result);
    nextAllowed = end + 1; // avoid overlapping benchmark positions
  }
  const wins = trades.filter((t) => t.outcome === "win").length;
  const losses = trades.filter((t) => t.outcome === "loss").length;
  const unresolved = trades.length - wins - losses;
  const resolved = wins + losses;
  const grossWin = trades.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0));
  let equity = 0, peak = 0, maxDrawdownR = 0;
  for (const trade of trades) { equity += trade.r; peak = Math.max(peak, equity); maxDrawdownR = Math.max(maxDrawdownR, peak - equity); }
  return {
    trades: trades.length, wins, losses, unresolved,
    winRate: resolved ? Number((wins / resolved * 100).toFixed(1)) : null,
    expectancyR: trades.length ? Number((trades.reduce((a, t) => a + t.r, 0) / trades.length).toFixed(2)) : null,
    profitFactor: grossLoss ? Number((grossWin / grossLoss).toFixed(2)) : grossWin ? null : 0,
    maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    methodology: `Walk-forward ${lookback}-bar breakout benchmark; next-bar-open entry, 1.5R target, 1R stop, ${horizon}-bar maximum hold. Signals use past bars only; overlapping positions are skipped; same-bar stop/target ties count as losses. Unresolved trades are marked to the final close. This is a benchmark, not the live forecast rule.`
  };
}


function liquidityConfirmationBacktest(candles: MarketCandle[], horizon = 12, comparison: MarketCandle[] = [], multi: Record<string, MarketCandle[]> = {}) {
  // Chronological walk-forward test. The final 30% is reserved as a holdout;
  // signals in that period may use only candles available before each signal.
  type Trade = {
    outcome: "win" | "loss" | "unresolved"; r: number; time: string; index: number;
    direction: "bullish" | "bearish"; session: string; regime: string;
    exit: "target" | "stop" | "time"; entry: number; stop: number; target: number; exitTime: string; sample: "development" | "out-of-sample";
    factors: { structureBreak: boolean; trendAligned: boolean; fvg: boolean };
  };
  const valid = candles.filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low && c.time);
  const splitIndex = Math.max(40, Math.floor(valid.length * 0.7));
  const trades: Trade[] = [];
  const inSampleTrades: Trade[] = [];
  const outSampleTrades: Trade[] = [];
  let nextAllowed = 40;
  for (let i = 40; i < valid.length - 1; i++) {
    if (i < nextAllowed) continue;
    const history = valid.slice(0, i);
    const pivots = findPivots(history);
    const highPivots = pivots.filter((p) => p.kind === "high");
    const lowPivots = pivots.filter((p) => p.kind === "low");
    const pivotHigh = highPivots[highPivots.length - 1];
    const pivotLow = lowPivots[lowPivots.length - 1];
    if (!pivotHigh || !pivotLow) continue;
    const signal = valid[i];
    const atrProxy = median(history.slice(-20).map(candleRange));
    if (!finite(atrProxy) || atrProxy <= 0) continue;
    const range = candleRange(signal);
    const bodyRatio = Math.abs(signal.close - signal.open) / Math.max(range, 1e-9);
    const displacement = range / atrProxy >= 1.25 && bodyRatio >= 0.5;
    const buySweep = signal.low < pivotLow.price && signal.close > pivotLow.price;
    const sellSweep = signal.high > pivotHigh.price && signal.close < pivotHigh.price;
    const direction = buySweep && signal.close > signal.open && displacement ? 1
      : sellSweep && signal.close < signal.open && displacement ? -1 : 0;
    if (!direction) continue;

    const structureBreak = direction > 0 ? signal.close > pivotHigh.price : signal.close < pivotLow.price;
    const recentTrend = classifyStructure(history.slice(-80));
    const trendAligned = (direction > 0 && recentTrend === "bullish") || (direction < 0 && recentTrend === "bearish");
    const a = valid[i - 2], c = valid[i];
    const fvg = direction > 0 ? c.low > a.high : c.high < a.low;
    const score = 25 + 20 + (structureBreak ? 20 : 0) + (trendAligned ? 15 : 0) + (fvg ? 10 : 0);
    const aligned = 2 + Number(structureBreak) + Number(trendAligned) + Number(fvg);
    if (score < 60 || aligned < 3) continue;

    const entryIndex = i + 1;
    const entry = valid[entryIndex].open;
    const stopAnchor = direction > 0 ? Math.min(signal.low, pivotLow.price) : Math.max(signal.high, pivotHigh.price);
    const risk = Math.max(Math.abs(entry - stopAnchor) + atrProxy * 0.1, atrProxy * 0.8);
    if (!finite(entry) || !finite(risk) || risk <= 0 || risk > atrProxy * 4) continue;
    const stop = entry - direction * risk;
    const target = entry + direction * risk * 2;
    let result: { outcome: Trade["outcome"]; r: number; exit: Trade["exit"] } = { outcome: "unresolved", r: 0, exit: "time" };
    let exitIndex = Math.min(valid.length - 1, entryIndex + horizon - 1);
    const end = exitIndex;
    for (let j = entryIndex; j <= end; j++) {
      const bar = valid[j];
      const hitStop = direction > 0 ? bar.low <= stop : bar.high >= stop;
      const hitTarget = direction > 0 ? bar.high >= target : bar.low <= target;
      if (hitStop && hitTarget) { result = { outcome: "loss", r: -1, exit: "stop" }; exitIndex = j; break; }
      if (hitStop) { result = { outcome: "loss", r: -1, exit: "stop" }; exitIndex = j; break; }
      if (hitTarget) { result = { outcome: "win", r: 2, exit: "target" }; exitIndex = j; break; }
      if (j === end) result = { outcome: "unresolved", r: clamp(((bar.close - entry) * direction) / risk, -1, 2), exit: "time" };
    }
    const signalTime = new Date(valid[entryIndex].time);
    const utcHour = Number.isNaN(signalTime.getTime()) ? -1 : signalTime.getUTCHours();
    const session = utcHour < 0 ? "unknown" : utcHour < 7 ? "Asia (UTC)" : utcHour < 13 ? "London (UTC)" : utcHour < 21 ? "New York (UTC)" : "Off-hours (UTC)";
    const shortRange = median(history.slice(-20).map(candleRange)) || atrProxy;
    const longRange = median(history.slice(-80).map(candleRange)) || shortRange;
    const elevatedVolatility = shortRange > longRange * 1.35;
    const regime = recentTrend === "bullish" || recentTrend === "bearish"
      ? (elevatedVolatility ? "trending · elevated volatility" : "trending")
      : recentTrend === "range" ? (elevatedVolatility ? "ranging · elevated volatility" : "ranging") : "unclear";
    const trade: Trade = {
      ...result, time: valid[entryIndex].time, index: entryIndex, entry, stop, target, exitTime: valid[exitIndex].time, sample: i < splitIndex ? "development" : "out-of-sample",
      direction: direction > 0 ? "bullish" : "bearish", session, regime,
      factors: { structureBreak, trendAligned, fvg },
    };
    trades.push(trade);
    (i < splitIndex ? inSampleTrades : outSampleTrades).push(trade);
    nextAllowed = end + 1;
  }

  const summarize = (items: Trade[]) => {
    const wins = items.filter((t) => t.outcome === "win").length;
    const losses = items.filter((t) => t.outcome === "loss").length;
    const unresolved = items.length - wins - losses;
    const resolved = wins + losses;
    const grossWin = items.filter((t) => t.r > 0).reduce((sum, t) => sum + t.r, 0);
    const grossLoss = Math.abs(items.filter((t) => t.r < 0).reduce((sum, t) => sum + t.r, 0));
    let equity = 0, peak = 0, maxDrawdownR = 0;
    for (const trade of items) { equity += trade.r; peak = Math.max(peak, equity); maxDrawdownR = Math.max(maxDrawdownR, peak - equity); }
    return {
      trades: items.length, wins, losses, unresolved,
      winRate: resolved ? Number((wins / resolved * 100).toFixed(1)) : null,
      expectancyR: items.length ? Number((items.reduce((sum, t) => sum + t.r, 0) / items.length).toFixed(2)) : null,
      profitFactor: grossLoss ? Number((grossWin / grossLoss).toFixed(2)) : grossWin ? null : 0,
      maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    };
  };
  const all = summarize(trades);
  const train = summarize(inSampleTrades);
  const test = summarize(outSampleTrades);
  const months = new Map<string, Trade[]>();
  for (const trade of trades) {
    const month = trade.time.slice(0, 7) || "unknown";
    const bucket = months.get(month) || [];
    bucket.push(trade); months.set(month, bucket);
  }
  const monthly = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, items]) => ({
    month, trades: items.length,
    wins: items.filter((t) => t.outcome === "win").length,
    losses: items.filter((t) => t.outcome === "loss").length,
    expectancyR: Number((items.reduce((sum, t) => sum + t.r, 0) / items.length).toFixed(2)),
  }));
  const summarizeDiagnostic = (items: Trade[]) => {
    const wins = items.filter((t) => t.outcome === "win").length;
    const losses = items.filter((t) => t.outcome === "loss").length;
    const resolved = wins + losses;
    return {
      trades: items.length, wins, losses,
      expectancyR: items.length ? Number((items.reduce((sum, t) => sum + t.r, 0) / items.length).toFixed(2)) : null,
      winRate: resolved ? Number((wins / resolved * 100).toFixed(1)) : null,
    };
  };
  const groupBy = (key: "direction" | "session" | "regime") => {
    const groups = new Map<string, Trade[]>();
    for (const trade of trades) {
      const label = trade[key];
      const bucket = groups.get(label) || [];
      bucket.push(trade); groups.set(label, bucket);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => ({ label, ...summarizeDiagnostic(items) }));
  };
  const byExit = (["target", "stop", "time"] as const).map((label) => ({ label, trades: trades.filter((t) => t.exit === label).length }));
  const byFactor = ([
    ["Structure break", (t: Trade) => t.factors.structureBreak],
    ["Trend aligned", (t: Trade) => t.factors.trendAligned],
    ["FVG present", (t: Trade) => t.factors.fvg],
  ] as Array<[string, (t: Trade) => boolean]>).flatMap(([label, predicate]) => ([
    { label: `${label} · yes`, ...summarizeDiagnostic(trades.filter(predicate)) },
    { label: `${label} · no`, ...summarizeDiagnostic(trades.filter((trade) => !predicate(trade))) },
  ]));
  const diagnostics = {
    byDirection: groupBy("direction"), bySession: groupBy("session"), byRegime: groupBy("regime"),
    byExit, byFactor, sessionTimezone: "UTC derived from broker candle timestamps; confirm broker timestamp convention before interpreting session labels",
  };
  const costSensitivity = [0, 0.05, 0.1, 0.2].map((costR) => ({
    costR,
    netExpectancyR: trades.length ? Number((trades.reduce((sum, t) => sum + t.r - costR, 0) / trades.length).toFixed(2)) : null,
  }));
  const sampleAdequacy: "insufficient" | "limited" | "developing" | "larger-sample" = trades.length < 30 ? "insufficient" : trades.length < 75 ? "limited" : trades.length < 200 ? "developing" : "larger-sample";
  const research = strategyResearchVariants(valid, horizon);
  const entryQuality = entryQualityResearch(valid, horizon);
  const liquidityContext = liquidityContextResearch(valid, horizon);
  return {
    ...all,
    inSample: { trades: train.trades, expectancyR: train.expectancyR, winRate: train.winRate },
    outOfSample: { ...test, startTime: outSampleTrades[0]?.time || null, endTime: outSampleTrades[outSampleTrades.length - 1]?.time || null },
    costSensitivity,
    monthly,
    diagnostics,
    researchVariants: research.variants,
    researchMethodology: research.methodology,
    riskSensitivity: research.riskSensitivity,
    entryQuality: entryQuality.variants,
    entryQualityMethodology: entryQuality.methodology,
    liquidityContext: liquidityContext.variants,
    liquidityContextMethodology: liquidityContext.methodology,
    advancedValidation: runAdvancedValidation(valid, comparison, multi),
    tradeLedger: trades.map((trade, index) => ({ id: index + 1, sample: trade.sample, signalTime: valid[trade.index - 1]?.time || trade.time, entryTime: trade.time, exitTime: trade.exitTime, direction: trade.direction, entry: Number(trade.entry.toFixed(6)), stop: Number(trade.stop.toFixed(6)), target: Number(trade.target.toFixed(6)), outcome: trade.outcome, returnR: Number(trade.r.toFixed(3)), session: trade.session, regime: trade.regime, structureBreak: trade.factors.structureBreak, trendAligned: trade.factors.trendAligned, fvg: trade.factors.fvg })),
    sampleAdequacy,
    methodology: `Chronological walk-forward liquidity-confirmation proxy on ${valid.length} available broker candles; first 70% is the development period and final 30% is a chronological holdout. Each signal uses only prior candles; next-bar-open entry, 2R target, 1R stop, ${horizon}-bar maximum hold. Same-bar stop/target ties count as losses; overlapping positions are skipped; unresolved trades are marked to close. Cost sensitivity subtracts illustrative 0.05R/0.10R/0.20R per round trip; these are not measured broker spreads or commissions. This is a single-timeframe proxy and does not include HTF confirmation.`,
  };
}

function entryQualityResearch(candles: MarketCandle[], horizon = 12) {
  // Pre-declared entry-filter study. A candidate is a causal sweep/reclaim;
  // filters are applied to the same candidate universe and share fixed exits.
  type Candidate = {
    index: number; entryIndex: number; direction: 1 | -1; entry: number; stop: number; target: number;
    outcome: "win" | "loss" | "unresolved"; r: number; exitIndex: number;
    sample: "development" | "out-of-sample"; displacement: boolean; displacementAtr: number; sweepDepthAtr: number; reclaimAtr: number;
    bos: boolean; trend: boolean; fvg: boolean; entryGapAtr: number;
  };
  const valid = candles.filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low && Boolean(c.time));
  const splitIndex = Math.max(40, Math.floor(valid.length * 0.7));
  const candidates: Candidate[] = [];
  for (let i = 40; i < valid.length - 1; i++) {
    const history = valid.slice(0, i);
    const pivots = findPivots(history);
    const highs = pivots.filter((p) => p.kind === "high");
    const lows = pivots.filter((p) => p.kind === "low");
    const pivotHigh = highs[highs.length - 1];
    const pivotLow = lows[lows.length - 1];
    if (!pivotHigh || !pivotLow) continue;
    const signal = valid[i];
    const bullishSweep = signal.low < pivotLow.price && signal.close > pivotLow.price;
    const bearishSweep = signal.high > pivotHigh.price && signal.close < pivotHigh.price;
    if (bullishSweep === bearishSweep) continue;
    const direction: 1 | -1 = bullishSweep ? 1 : -1;
    const atr = median(history.slice(-20).map(candleRange));
    if (!finite(atr) || atr <= 0) continue;
    const signalRange = candleRange(signal);
    const bodyRatio = Math.abs(signal.close - signal.open) / Math.max(signalRange, 1e-9);
    const directionalBody = direction > 0 ? signal.close > signal.open : signal.close < signal.open;
    const displacementAtr = signalRange / atr;
    const sweepDepthAtr = (direction > 0 ? pivotLow.price - signal.low : signal.high - pivotHigh.price) / atr;
    const reclaimAtr = (direction > 0 ? signal.close - pivotLow.price : pivotHigh.price - signal.close) / atr;
    const displacement = directionalBody && displacementAtr >= 1.25 && bodyRatio >= 0.5;
    const bos = direction > 0 ? signal.close > pivotHigh.price : signal.close < pivotLow.price;
    const trendLabel = classifyStructure(history.slice(-80));
    const trend = direction > 0 ? trendLabel === "bullish" : trendLabel === "bearish";
    const prior = valid[i - 2];
    const fvg = direction > 0 ? signal.low > prior.high : signal.high < prior.low;
    const entryIndex = i + 1;
    const entry = valid[entryIndex].open;
    const anchor = direction > 0 ? Math.min(signal.low, pivotLow.price) : Math.max(signal.high, pivotHigh.price);
    const risk = Math.max(Math.abs(entry - anchor) + atr * 0.1, atr * 0.8);
    if (!finite(entry) || !finite(risk) || risk <= 0 || risk > atr * 4) continue;
    const stop = entry - direction * risk;
    const targetR = 1.5;
    const target = entry + direction * risk * targetR;
    const end = Math.min(valid.length - 1, entryIndex + horizon - 1);
    let outcome: Candidate["outcome"] = "unresolved";
    let r = clamp(((valid[end].close - entry) * direction) / risk, -1, targetR);
    let exitIndex = end;
    for (let j = entryIndex; j <= end; j++) {
      const bar = valid[j];
      const stopHit = direction > 0 ? bar.low <= stop : bar.high >= stop;
      const targetHit = direction > 0 ? bar.high >= target : bar.low <= target;
      if (stopHit && targetHit) { outcome = "loss"; r = -1; exitIndex = j; break; }
      if (stopHit) { outcome = "loss"; r = -1; exitIndex = j; break; }
      if (targetHit) { outcome = "win"; r = targetR; exitIndex = j; break; }
    }
    candidates.push({ index: i, entryIndex, direction, entry, stop, target, outcome, r, exitIndex,
      sample: i < splitIndex ? "development" : "out-of-sample", displacement, displacementAtr, sweepDepthAtr, reclaimAtr,
      bos, trend, fvg, entryGapAtr: Math.abs(entry - signal.close) / atr });
  }
  const definitions = [
    { name: "Sweep + reclaim", rule: "Any confirmed wick sweep that closes back through its swept swing", accepts: (_c: Candidate) => true },
    { name: "Sweep + displacement", rule: "Sweep/reclaim plus directional body, range ≥1.25× prior median range and body/range ≥0.50", accepts: (c: Candidate) => c.displacement },
    { name: "Sweep + displacement + BOS", rule: "Sweep/reclaim + displacement + close beyond the opposing confirmed swing", accepts: (c: Candidate) => c.displacement && c.bos },
    { name: "Sweep + displacement + trend", rule: "Sweep/reclaim + displacement + prior 80-bar swing structure aligned", accepts: (c: Candidate) => c.displacement && c.trend },
    { name: "Sweep + displacement + BOS + trend", rule: "Sweep/reclaim + displacement + BOS + prior structure aligned", accepts: (c: Candidate) => c.displacement && c.bos && c.trend },
    { name: "Sweep + displacement + FVG", rule: "Sweep/reclaim + displacement + directional three-candle gap", accepts: (c: Candidate) => c.displacement && c.fvg },
    { name: "Sweep + displacement · no chase", rule: "Sweep/reclaim + displacement + next-open gap ≤0.25× prior median range", accepts: (c: Candidate) => c.displacement && c.entryGapAtr <= 0.25 },
    { name: "Sweep + displacement + BOS · no chase", rule: "Sweep/reclaim + displacement + BOS + next-open gap ≤0.25× prior median range", accepts: (c: Candidate) => c.displacement && c.bos && c.entryGapAtr <= 0.25 },
    { name: "Sweep quality · shallow (0.05–0.25 ATR)", rule: "Sweep depth 0.05–0.25 ATR with reclaim close ≥0.10 ATR back through swing", accepts: (c: Candidate) => c.sweepDepthAtr >= 0.05 && c.sweepDepthAtr <= 0.25 && c.reclaimAtr >= 0.10 },
    { name: "Sweep quality · balanced (≥0.10 ATR)", rule: "Sweep depth ≥0.10 ATR and reclaim close ≥0.20 ATR back through swing", accepts: (c: Candidate) => c.sweepDepthAtr >= 0.10 && c.reclaimAtr >= 0.20 },
    { name: "Sweep quality · strong (≥0.20 ATR)", rule: "Sweep depth ≥0.20 ATR and reclaim close ≥0.35 ATR back through swing", accepts: (c: Candidate) => c.sweepDepthAtr >= 0.20 && c.reclaimAtr >= 0.35 },
  ];
  const summarize = (items: Candidate[]) => {
    const wins = items.filter((x) => x.outcome === "win").length;
    const losses = items.filter((x) => x.outcome === "loss").length;
    const resolved = wins + losses;
    const grossWins = items.filter((x) => x.r > 0).reduce((sum, x) => sum + x.r, 0);
    const grossLoss = Math.abs(items.filter((x) => x.r < 0).reduce((sum, x) => sum + x.r, 0));
    let equity = 0, peak = 0, drawdown = 0;
    for (const item of items) { equity += item.r; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); }
    const medianValue = (values: number[]) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2);
      return Number((sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
    };
    return { trades: items.length, expectancy: items.length ? Number((items.reduce((sum, x) => sum + x.r, 0) / items.length).toFixed(2)) : null,
      winRate: resolved ? Number((wins / resolved * 100).toFixed(1)) : null,
      profitFactor: grossLoss ? Number((grossWins / grossLoss).toFixed(2)) : grossWins ? null : 0,
      drawdown: Number(drawdown.toFixed(2)), net: items.length ? Number((items.reduce((sum, x) => sum + x.r - 0.1, 0) / items.length).toFixed(2)) : null };
  };
  const variants = definitions.map((definition) => {
    const selected: Candidate[] = [];
    let nextAllowed = 40;
    for (const candidate of candidates) {
      if (candidate.index < nextAllowed || !definition.accepts(candidate)) continue;
      selected.push(candidate);
      nextAllowed = candidate.exitIndex + 1;
    }
    const dev = summarize(selected.filter((x) => x.sample === "development"));
    const oosItems = selected.filter((x) => x.sample === "out-of-sample");
    const oos = summarize(oosItems);
    const status = oos.trades < 10 ? "insufficient" as const : oos.trades < 30 ? "descriptive" as const : "exploratory" as const;
    const medianValues = (items: Candidate[], key: "displacementAtr" | "entryGapAtr" | "sweepDepthAtr" | "reclaimAtr") => {
      const values = items.map((x) => x[key]).sort((a, b) => a - b);
      if (!values.length) return null;
      const mid = Math.floor(values.length / 2);
      return Number((values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2).toFixed(2));
    };
    return { name: definition.name, rule: definition.rule, trades: selected.length, developmentTrades: dev.trades,
      outOfSampleTrades: oos.trades, developmentExpectancyR: dev.expectancy, outOfSampleExpectancyR: oos.expectancy,
      outOfSampleWinRate: oos.winRate, outOfSampleProfitFactor: oos.profitFactor, outOfSampleMaxDrawdownR: oos.drawdown,
      netExpectancyAt010R: oos.net, medianDisplacementAtr: medianValues(oosItems, "displacementAtr"),
      medianEntryGapAtr: medianValues(oosItems, "entryGapAtr"),
      medianSweepDepthAtr: medianValues(oosItems, "sweepDepthAtr"), medianReclaimAtr: medianValues(oosItems, "reclaimAtr"),
      filteredOutCandidates: candidates.filter((c) => !definition.accepts(c)).length,
      filteredOutWins: candidates.filter((c) => !definition.accepts(c) && c.outcome === "win").length,
      filteredOutLosses: candidates.filter((c) => !definition.accepts(c) && c.outcome === "loss").length, status };
  });
  return { variants, methodology: `Pre-declared entry-filter and sweep-quality ablation over ${candidates.length} causal sweep/reclaim candidates. All variants use next-bar-open entry, common structural/volatility stop, fixed 1.5R target, ${horizon}-bar horizon, adverse-first same-candle ties and non-overlapping trades per variant. The chronological split is 70% development / 30% untouched holdout. Displacement is measured against the prior 20-bar median candle range; entry chase is next-open distance from signal close divided by that same range. Sweep depth is wick penetration beyond the prior confirmed swing divided by prior median candle range; reclaim strength is the close back through that swing on the same scale. Shallow, balanced and strong thresholds are pre-declared. Filtered-out win/loss counts are descriptive counts over the raw shared candidate universe, not independent trade outcomes. 0.10R cost is illustrative, not measured broker spread/commission. Variants share candidates and are correlated; this is exploratory research, not a strategy selector. OOS <10 trades is insufficient; 10–29 descriptive; 30+ exploratory only.` };
}

function liquidityContextResearch(candles: MarketCandle[], horizon = 12) {
  // UTC context labels are derived only from candles preceding the signal bar.
  // They are exploratory proxies; broker timestamps must be verified as UTC.
  type Row = { index: number; sample: "development" | "out-of-sample"; outcome: "win" | "loss" | "unresolved"; r: number; exitIndex: number };
  const valid = candles.filter(c => [c.open,c.high,c.low,c.close].every(finite) && c.high >= c.low && Boolean(c.time));
  const split = Math.max(40, Math.floor(valid.length * .7));
  const universe: Array<Row & { flags: Record<string, boolean> }> = [];
  for (let i=40;i<valid.length-1;i++) {
    const history=valid.slice(0,i), pivots=findPivots(history), highs=pivots.filter(p=>p.kind==="high"), lows=pivots.filter(p=>p.kind==="low");
    const ph=highs[highs.length-1], pl=lows[lows.length-1]; if(!ph||!pl) continue;
    const bar=valid[i], bull=bar.low<pl.price && bar.close>pl.price, bear=bar.high>ph.price && bar.close<ph.price;
    if(bull===bear) continue;
    const dir:1|-1=bull?1:-1, atr=median(history.slice(-20).map(candleRange)); if(!(atr>0)) continue;
    const ts=Date.parse(bar.time); if(!Number.isFinite(ts)) continue;
    const d=new Date(ts), dayStart=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
    const previousDay=valid.filter(c=>{const t=Date.parse(c.time);return Number.isFinite(t)&&t>=dayStart-86400000&&t<dayStart;});
    const asia=history.filter(c=>{const t=Date.parse(c.time);if(!Number.isFinite(t))return false;const x=new Date(t);return Date.UTC(x.getUTCFullYear(),x.getUTCMonth(),x.getUTCDate())===dayStart && x.getUTCHours()>=0 && x.getUTCHours()<6;});
    const prevHigh=previousDay.length?Math.max(...previousDay.map(c=>c.high)):null, prevLow=previousDay.length?Math.min(...previousDay.map(c=>c.low)):null;
    const asiaHigh=asia.length?Math.max(...asia.map(c=>c.high)):null, asiaLow=asia.length?Math.min(...asia.map(c=>c.low)):null;
    const recentHigh=highs.slice(-50).filter(p=>Math.abs(p.price-ph.price)<=atr*.1).length>=2;
    const recentLow=lows.slice(-50).filter(p=>Math.abs(p.price-pl.price)<=atr*.1).length>=2;
    const priorEqualHigh=highs.slice(-50).some(p=>Math.abs(p.price-bar.high)<=atr*.1);
    const priorEqualLow=lows.slice(-50).some(p=>Math.abs(p.price-bar.low)<=atr*.1);
    const flags={
      "Previous-day high/low sweep": dir<0 ? prevHigh!==null&&bar.high>prevHigh&&bar.close<prevHigh : prevLow!==null&&bar.low<prevLow&&bar.close>prevLow,
      "Asian-session high/low sweep": dir<0 ? asiaHigh!==null&&bar.high>asiaHigh&&bar.close<asiaHigh : asiaLow!==null&&bar.low<asiaLow&&bar.close>asiaLow,
      "Equal highs/lows sweep": dir<0 ? priorEqualHigh : priorEqualLow,
      "Recent swing sweep": true,
      "Sweep + reclaim + displacement": (dir>0?bar.close>bar.open:bar.close<bar.open) && candleRange(bar)/atr>=1.25,
      "Sweep + reclaim + displacement + BOS": (dir>0?bar.close>bar.open:bar.close<bar.open) && candleRange(bar)/atr>=1.25 && (dir>0?bar.close>ph.price:bar.close<pl.price),
      "Higher-timeframe proxy alignment": (()=>{const h=history.slice(-48);if(h.length<24)return false;const mid=h.slice(0,24).reduce((a,c)=>a+c.close,0)/24;const recent=h.slice(-24).reduce((a,c)=>a+c.close,0)/24;return dir>0?recent>mid:recent<mid;})(),
    };
    const entryIndex=i+1, entry=valid[entryIndex].open, anchor=dir>0?Math.min(bar.low,pl.price):Math.max(bar.high,ph.price), risk=Math.max(Math.abs(entry-anchor)+atr*.1,atr*.8);
    if(!finite(entry)||!finite(risk)||risk<=0||risk>atr*4)continue;
    const stop=entry-dir*risk,target=entry+dir*risk*1.5,end=Math.min(valid.length-1,entryIndex+horizon-1);let outcome:Row["outcome"]="unresolved",r=clamp(((valid[end].close-entry)*dir)/risk,-1,1.5),exitIndex=end;
    for(let j=entryIndex;j<=end;j++){const c=valid[j],sh=dir>0?c.low<=stop:c.high>=stop,th=dir>0?c.high>=target:c.low<=target;if(sh&&th){outcome="loss";r=-1;exitIndex=j;break;}if(sh){outcome="loss";r=-1;exitIndex=j;break;}if(th){outcome="win";r=1.5;exitIndex=j;break;}}
    universe.push({index:i,sample:i<split?"development":"out-of-sample",outcome,r,exitIndex,flags});
  }
  const names=["Previous-day high/low sweep","Asian-session high/low sweep","Equal highs/lows sweep","Recent swing sweep","Sweep + reclaim + displacement","Sweep + reclaim + displacement + BOS","Higher-timeframe proxy alignment"];
  const summarize=(rows:typeof universe)=>{const resolved=rows.filter(x=>x.outcome!=="unresolved"),wins=resolved.filter(x=>x.outcome==="win"),losses=resolved.filter(x=>x.outcome==="loss"),grossWin=wins.reduce((a,x)=>a+x.r,0),grossLoss=Math.abs(losses.reduce((a,x)=>a+x.r,0));let eq=0,peak=0,dd=0;for(const x of rows){eq+=x.r;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}return {trades:rows.length,expectancy:rows.length?Number((rows.reduce((a,x)=>a+x.r,0)/rows.length).toFixed(2)):null,winRate:resolved.length?Number((wins.length/resolved.length*100).toFixed(1)):null,pf:grossLoss?Number((grossWin/grossLoss).toFixed(2)):grossWin?null:0,dd:Number(dd.toFixed(2)),net:rows.length?Number((rows.reduce((a,x)=>a+x.r-.1,0)/rows.length).toFixed(2)):null};};
  const variants=names.map(name=>{const selected=universe.filter(x=>x.flags[name]);let next=-1;const nonOverlap=selected.filter(x=>{if(x.index<next)return false;next=x.exitIndex+1;return true;});const dev=summarize(nonOverlap.filter(x=>x.sample==="development")),oos=summarize(nonOverlap.filter(x=>x.sample==="out-of-sample"));return {name,rule:`Causal ${name.toLowerCase()} context; next-bar entry, fixed structural/volatility stop and 1.5R target`,trades:nonOverlap.length,developmentTrades:dev.trades,outOfSampleTrades:oos.trades,developmentExpectancyR:dev.expectancy,outOfSampleExpectancyR:oos.expectancy,outOfSampleWinRate:oos.winRate,outOfSampleProfitFactor:oos.pf,outOfSampleMaxDrawdownR:oos.dd,netExpectancyAt010R:oos.net,status:oos.trades<10?"insufficient" as const:oos.trades<30?"descriptive" as const:"exploratory" as const};});
  return {variants,methodology:`Seven pre-declared liquidity-context labels are tested on broker candles. Previous-day and Asian-session levels are calculated from UTC timestamps; Asian session is defined as 00:00–06:00 UTC. Equal highs/lows use a 0.10 ATR proximity proxy; recent swing uses confirmed pivots. Higher-timeframe alignment is only a same-timeframe 24-bar mean comparison proxy, not genuine HTF broker data. Signals use next-bar-open entry, shared structural/volatility stop, fixed 1.5R target, ${horizon}-bar horizon, adverse-first same-candle handling and non-overlapping trades per variant. Chronological 70/30 development/holdout split. 0.10R cost is illustrative, not measured broker spread/commission. Timestamp convention must be verified; results are exploratory, not a live strategy selector.`};
}

function strategyResearchVariants(candles: MarketCandle[], horizon = 12) {
  // Pre-declared ablation variants share one causal candidate universe. This is
  // research only: variants are not ranked or auto-selected as a live strategy.
  type Candidate = {
    index: number; direction: 1 | -1; entry: number; stop: number; target: number;
    outcome: "win" | "loss" | "unresolved"; r: number; sample: "development" | "out-of-sample";
    factors: { bos: boolean; trend: boolean; fvg: boolean };
    entryIndex: number; atr: number; anchor: number;
  };
  const valid = candles.filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low && Boolean(c.time));
  const splitIndex = Math.max(40, Math.floor(valid.length * 0.7));
  const variants = [
    { name: "Baseline · any one confirmation", rule: "Sweep + displacement + at least one of BOS, trend alignment or FVG", accepts: (f: Candidate["factors"]) => f.bos || f.trend || f.fvg },
    { name: "BOS required", rule: "Sweep + displacement + confirmed close beyond opposing swing", accepts: (f: Candidate["factors"]) => f.bos },
    { name: "Trend alignment required", rule: "Sweep + displacement + recent swing structure aligned", accepts: (f: Candidate["factors"]) => f.trend },
    { name: "FVG required", rule: "Sweep + displacement + directional three-candle gap", accepts: (f: Candidate["factors"]) => f.fvg },
    { name: "BOS + trend", rule: "Sweep + displacement + BOS + trend alignment", accepts: (f: Candidate["factors"]) => f.bos && f.trend },
    { name: "BOS + FVG", rule: "Sweep + displacement + BOS + directional FVG", accepts: (f: Candidate["factors"]) => f.bos && f.fvg },
    { name: "Trend + FVG", rule: "Sweep + displacement + trend alignment + directional FVG", accepts: (f: Candidate["factors"]) => f.trend && f.fvg },
    { name: "All three confirmations", rule: "Sweep + displacement + BOS + trend alignment + directional FVG", accepts: (f: Candidate["factors"]) => f.bos && f.trend && f.fvg },
  ];
  const candidates: Candidate[] = [];
  for (let i = 40; i < valid.length - 1; i++) {
    const history = valid.slice(0, i);
    const pivots = findPivots(history);
    const highPivots = pivots.filter((p) => p.kind === "high");
    const lowPivots = pivots.filter((p) => p.kind === "low");
    const pivotHigh = highPivots[highPivots.length - 1];
    const pivotLow = lowPivots[lowPivots.length - 1];
    if (!pivotHigh || !pivotLow) continue;
    const signal = valid[i];
    const atrProxy = median(history.slice(-20).map(candleRange));
    if (!finite(atrProxy) || atrProxy <= 0) continue;
    const signalRange = candleRange(signal);
    const displacement = signalRange / atrProxy >= 1.25 && Math.abs(signal.close - signal.open) / signalRange >= 0.5;
    const bullishSweep = signal.low < pivotLow.price && signal.close > pivotLow.price && signal.close > signal.open;
    const bearishSweep = signal.high > pivotHigh.price && signal.close < pivotHigh.price && signal.close < signal.open;
    const direction: 1 | -1 | 0 = bullishSweep && displacement ? 1 : bearishSweep && displacement ? -1 : 0;
    if (!direction) continue;
    const trendLabel = classifyStructure(history.slice(-80));
    const factors = {
      bos: direction > 0 ? signal.close > pivotHigh.price : signal.close < pivotLow.price,
      trend: direction > 0 ? trendLabel === "bullish" : trendLabel === "bearish",
      fvg: direction > 0 ? signal.low > valid[i - 2].high : signal.high < valid[i - 2].low,
    };
    const entryIndex = i + 1;
    const entry = valid[entryIndex].open;
    const anchor = direction > 0 ? Math.min(signal.low, pivotLow.price) : Math.max(signal.high, pivotHigh.price);
    const risk = Math.max(Math.abs(entry - anchor) + atrProxy * 0.1, atrProxy * 0.8);
    if (!finite(entry) || !finite(risk) || risk <= 0 || risk > atrProxy * 4) continue;
    const stop = entry - direction * risk;
    const target = entry + direction * risk * 2;
    const end = Math.min(valid.length - 1, entryIndex + horizon - 1);
    let outcome: Candidate["outcome"] = "unresolved";
    let r = clamp(((valid[end].close - entry) * direction) / risk, -1, 2);
    for (let j = entryIndex; j <= end; j++) {
      const bar = valid[j];
      const stopHit = direction > 0 ? bar.low <= stop : bar.high >= stop;
      const targetHit = direction > 0 ? bar.high >= target : bar.low <= target;
      if (stopHit && targetHit) { outcome = "loss"; r = -1; break; }
      if (stopHit) { outcome = "loss"; r = -1; break; }
      if (targetHit) { outcome = "win"; r = 2; break; }
    }
    candidates.push({ index: i, direction, entry, stop, target, outcome, r, sample: i < splitIndex ? "development" : "out-of-sample", factors, entryIndex, atr: atrProxy, anchor });
  }
  const summarize = (items: Candidate[]) => {
    const wins = items.filter((t) => t.outcome === "win").length;
    const losses = items.filter((t) => t.outcome === "loss").length;
    const resolved = wins + losses;
    const grossWins = items.filter((t) => t.r > 0).reduce((sum, t) => sum + t.r, 0);
    const grossLoss = Math.abs(items.filter((t) => t.r < 0).reduce((sum, t) => sum + t.r, 0));
    let equity = 0, peak = 0, drawdown = 0;
    for (const trade of items) { equity += trade.r; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); }
    return {
      trades: items.length,
      expectancy: items.length ? Number((items.reduce((sum, t) => sum + t.r, 0) / items.length).toFixed(2)) : null,
      winRate: resolved ? Number((wins / resolved * 100).toFixed(1)) : null,
      profitFactor: grossLoss ? Number((grossWins / grossLoss).toFixed(2)) : grossWins ? null : 0,
      drawdown: Number(drawdown.toFixed(2)),
      netAt010: items.length ? Number((items.reduce((sum, t) => sum + t.r - 0.1, 0) / items.length).toFixed(2)) : null,
    };
  };
  const reports = variants.map((variant) => {
    const selected: Candidate[] = [];
    let nextAllowed = 40;
    for (const candidate of candidates) {
      if (candidate.index < nextAllowed || !variant.accepts(candidate.factors)) continue;
      selected.push(candidate);
      nextAllowed = Math.min(valid.length - 1, candidate.index + horizon + 1);
    }
    const development = summarize(selected.filter((t) => t.sample === "development"));
    const holdout = summarize(selected.filter((t) => t.sample === "out-of-sample"));
    const status = holdout.trades < 10 ? "insufficient" as const : holdout.trades < 30 ? "descriptive" as const : "exploratory" as const;
    return {
      name: variant.name, rule: variant.rule, trades: selected.length,
      developmentTrades: development.trades, outOfSampleTrades: holdout.trades,
      developmentExpectancyR: development.expectancy, outOfSampleExpectancyR: holdout.expectancy,
      outOfSampleWinRate: holdout.winRate, outOfSampleProfitFactor: holdout.profitFactor,
      outOfSampleMaxDrawdownR: holdout.drawdown, outOfSampleNetExpectancyAt010R: holdout.netAt010, status,
    };
  });
  // Pre-declared risk-parameter sensitivity grid. The signal candidate universe
  // is held fixed so these rows isolate stop/target choices rather than silently
  // changing entry rules. Each scenario is simulated independently.
  const riskConfigurations = (["structural", "atr"] as const).flatMap((stopModel) => [1, 1.5, 2, 3].map((targetR) => ({
    name: `${stopModel === "structural" ? "Structural stop" : "1.0 ATR stop"} · ${targetR}R target`, stopModel, targetR,
  })));
  const riskSensitivity = riskConfigurations.map((configuration) => {
    const selected: Array<{ sample: "development" | "out-of-sample"; r: number; outcome: "win" | "loss" | "unresolved" }> = [];
    let nextAllowed = 40;
    for (const candidate of candidates) {
      if (candidate.index < nextAllowed) continue;
      const risk = configuration.stopModel === "structural"
        ? Math.max(Math.abs(candidate.entry - candidate.anchor) + candidate.atr * 0.1, candidate.atr * 0.8)
        : candidate.atr;
      if (!finite(risk) || risk <= 0 || risk > candidate.atr * 4) continue;
      const stop = candidate.entry - candidate.direction * risk;
      const target = candidate.entry + candidate.direction * risk * configuration.targetR;
      const end = Math.min(valid.length - 1, candidate.entryIndex + horizon - 1);
      let outcome: "win" | "loss" | "unresolved" = "unresolved";
      let resultR = clamp(((valid[end].close - candidate.entry) * candidate.direction) / risk, -1, configuration.targetR);
      let exitIndex = end;
      for (let j = candidate.entryIndex; j <= end; j++) {
        const bar = valid[j];
        const stopHit = candidate.direction > 0 ? bar.low <= stop : bar.high >= stop;
        const targetHit = candidate.direction > 0 ? bar.high >= target : bar.low <= target;
        if (stopHit && targetHit) { outcome = "loss"; resultR = -1; exitIndex = j; break; }
        if (stopHit) { outcome = "loss"; resultR = -1; exitIndex = j; break; }
        if (targetHit) { outcome = "win"; resultR = configuration.targetR; exitIndex = j; break; }
      }
      selected.push({ sample: candidate.sample, r: resultR, outcome });
      nextAllowed = exitIndex + 1;
    }
    const summarizeRisk = (items: typeof selected) => {
      const wins = items.filter((item) => item.outcome === "win").length;
      const losses = items.filter((item) => item.outcome === "loss").length;
      const resolved = wins + losses;
      const grossWin = items.filter((item) => item.r > 0).reduce((sum, item) => sum + item.r, 0);
      const grossLoss = Math.abs(items.filter((item) => item.r < 0).reduce((sum, item) => sum + item.r, 0));
      let equity = 0, peak = 0, drawdown = 0;
      for (const item of items) { equity += item.r; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); }
      return { trades: items.length, expectancy: items.length ? Number((items.reduce((sum, item) => sum + item.r, 0) / items.length).toFixed(2)) : null,
        winRate: resolved ? Number((wins / resolved * 100).toFixed(1)) : null,
        profitFactor: grossLoss ? Number((grossWin / grossLoss).toFixed(2)) : grossWin ? null : 0,
        drawdown: Number(drawdown.toFixed(2)), net: items.length ? Number((items.reduce((sum, item) => sum + item.r - 0.1, 0) / items.length).toFixed(2)) : null };
    };
    const development = summarizeRisk(selected.filter((item) => item.sample === "development"));
    const holdout = summarizeRisk(selected.filter((item) => item.sample === "out-of-sample"));
    const status = holdout.trades < 10 ? "insufficient" as const : holdout.trades < 30 ? "descriptive" as const : "exploratory" as const;
    return { ...configuration, trades: selected.length, developmentTrades: development.trades, outOfSampleTrades: holdout.trades,
      developmentExpectancyR: development.expectancy, outOfSampleExpectancyR: holdout.expectancy, outOfSampleWinRate: holdout.winRate,
      outOfSampleProfitFactor: holdout.profitFactor, outOfSampleMaxDrawdownR: holdout.drawdown, netExpectancyAt010R: holdout.net, status };
  });
  return {
    variants: reports,
    riskSensitivity,
    methodology: `Pre-declared ablation study over a shared causal candidate universe: confirmed sweep + displacement, then fixed filters for BOS, trend alignment and FVG. Each variant is simulated independently with next-bar-open entry, 1R structural/volatility stop, 2R target, ${horizon}-bar horizon, same-bar stop/target ties treated as losses, and non-overlapping trades per variant. Chronological 70/30 development/holdout split. The 0.10R cost is illustrative only, not a measured broker cost. Variants are correlated and multiple comparisons create selection bias; do not pick the best row as a live strategy. Out-of-sample groups under 10 trades are marked insufficient; 10–29 descriptive; 30+ exploratory, not statistically validated.`,
  };
}

function historicalMatches(candles: MarketCandle[], currentVector: number[], currentRange: number, horizon = 12) {
  const candidates: Array<{ index: number; d: number; outcome: PatternMatch["outcome"]; returnR: number }> = [];
  const earliest = Math.max(8, candles.length - 260);
  const latest = candles.length - horizon - 7;
  for (let i = earliest; i <= latest; i++) {
    // Keep the pattern window and its outcome horizon clear of the current pattern.
    if (i >= candles.length - 5 - horizon) continue;
    const d = distance(patternVector(candles, i), currentVector);
    if (d > 0.82) continue;
    const localRange = median(candles.slice(Math.max(0, i - 10), i + 1).map(candleRange)) || currentRange;
    const result = evaluateOutcome(candles, i, horizon, Math.max(localRange, 1e-9));
    candidates.push({ index: i, d, ...result });
  }
  candidates.sort((a, b) => a.d - b.d);
  const selected = candidates.slice(0, 20);
  const resolved = selected.filter((m) => m.outcome !== "unresolved");
  const wins = resolved.filter((m) => m.outcome === "win").length;
  const losses = resolved.length - wins;
  const matches: PatternMatch[] = selected.slice(0, 8).map((m) => ({
    time: candles[m.index].time,
    distance: Number(m.d.toFixed(3)),
    outcome: m.outcome,
    returnR: Number(m.returnR.toFixed(2)),
  }));
  return {
    samples: selected.length, wins, losses,
    unresolved: selected.length - resolved.length,
    winRate: resolved.length ? Number((wins / resolved.length * 100).toFixed(1)) : null,
    averageR: selected.length ? Number((selected.reduce((sum, m) => sum + m.returnR, 0) / selected.length).toFixed(2)) : null,
    matches,
  };
}

function classifyStructure(candles: MarketCandle[]): "bullish" | "bearish" | "range" | "unclear" {
  const valid = candles.filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low);
  if (valid.length < 20) return "unclear";
  const pivots = findPivots(valid);
  const highs = pivots.filter((p) => p.kind === "high").slice(-2);
  const lows = pivots.filter((p) => p.kind === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return "unclear";
  if (highs[1].price > highs[0].price && lows[1].price > lows[0].price) return "bullish";
  if (highs[1].price < highs[0].price && lows[1].price < lows[0].price) return "bearish";
  return "range";
}

const timeframeMinutes: Record<string, number> = { "1min": 1, "5min": 5, "15min": 15, "30min": 30, "1h": 60, "4h": 240, "1day": 1440 };

export function auditCandleHistory(candles: MarketCandle[], timeframe: string) {
  const intervalMinutes = timeframeMinutes[timeframe] ?? null;
  let invalidOhlc = 0, invalidTimestamp = 0, missingVolume = 0, outOfOrderTimestamps = 0;
  const seen = new Set<number>();
  let duplicateTimestamps = 0, offsetTimestamps = 0;
  const parsed: Array<{ time: number; candle: MarketCandle }> = [];
  let previousRawTime = -Infinity;
  for (const candle of candles) {
    const ohlcValid = [candle.open, candle.high, candle.low, candle.close].every(finite) && candle.high >= candle.low && candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close);
    if (!ohlcValid) invalidOhlc++;
    if (candle.volume == null || !finite(Number(candle.volume))) missingVolume++;
    const stamp = typeof candle.time === "string" ? candle.time.trim() : "";
    const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(stamp);
    if (hasExplicitZone) offsetTimestamps++;
    // Naive broker timestamps are parsed for ordering only, but flagged as timezone-ambiguous.
    const parsedTime = stamp ? Date.parse(hasExplicitZone ? stamp : `${stamp}Z`) : NaN;
    if (!Number.isFinite(parsedTime)) { invalidTimestamp++; continue; }
    if (parsedTime < previousRawTime) outOfOrderTimestamps++;
    previousRawTime = parsedTime;
    if (seen.has(parsedTime)) { duplicateTimestamps++; continue; }
    seen.add(parsedTime);
    if (ohlcValid) parsed.push({ time: parsedTime, candle });
  }
  parsed.sort((a, b) => a.time - b.time);
  const gaps: number[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const deltaMinutes = (parsed[i].time - parsed[i - 1].time) / 60000;
    if (intervalMinutes && deltaMinutes > intervalMinutes * 1.8) gaps.push(deltaMinutes);
  }
  const internalGapCount = gaps.filter((gap) => gap < 18 * 60).length;
  const longClosureGapCount = gaps.length - internalGapCount;
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianIntervalMinutes = parsed.length > 1
    ? Number((((parsed[parsed.length - 1].time - parsed[0].time) / (parsed.length - 1)) / 60000).toFixed(2))
    : null;
  const validCandles = parsed.length;
  return {
    rawCandles: candles.length, validCandles, invalidOhlc, invalidTimestamp, duplicateTimestamps,
    outOfOrderTimestamps, missingVolume,
    volumeCoveragePercent: candles.length ? Number(((candles.length - missingVolume) / candles.length * 100).toFixed(1)) : 0,
    timezoneOffsetCoveragePercent: candles.length ? Number((offsetTimestamps / candles.length * 100).toFixed(1)) : 0,
    intervalMinutes, medianIntervalMinutes, internalGapCount, longClosureGapCount,
    maxGapHours: sortedGaps.length ? Number((sortedGaps[sortedGaps.length - 1] / 60).toFixed(2)) : null,
    timestampAssumption: "Timestamps with Z or an explicit UTC offset are unambiguous. Naive timestamps are interpreted as UTC for ordering but their broker timezone cannot be verified from the candle payload.",
    normalizedCandles: parsed.map((item) => ({ ...item.candle, time: new Date(item.time).toISOString() })),
  };
}

export function buildMarketForecast(input: {
  candles: MarketCandle[];
  symbol: string;
  broker: "ctrader" | "exness";
  timeframe: string;
  source: string;
  mode: string;
  dataNote?: string;
  historyOldestCandle?: string | null;
  historyRequestedBars?: number;
  higherTimeframeCandles?: MarketCandle[];
  higherTimeframe?: string | null;
  multiTimeframeCandles?: Record<string, MarketCandle[]>;
  comparisonCandles?: MarketCandle[];
}): MarketForecast {
  const dataQuality = auditCandleHistory(input.candles, input.timeframe);
  const candles = dataQuality.normalizedCandles.slice(-2500);
  if (candles.length < 45) throw new Error(`At least 45 valid historical candles are required; received ${candles.length}.`);
  const last = candles[candles.length - 1];
  const pivots = findPivots(candles);
  const highs = pivots.filter((p) => p.kind === "high").slice(-2);
  const lows = pivots.filter((p) => p.kind === "low").slice(-2);
  let trend: MarketForecast["structure"]["trend"] = "unclear";
  if (highs.length === 2 && lows.length === 2) {
    if (highs[1].price > highs[0].price && lows[1].price > lows[0].price) trend = "bullish";
    else if (highs[1].price < highs[0].price && lows[1].price < lows[0].price) trend = "bearish";
    else trend = "range";
  }

  const higherCandles = (input.higherTimeframeCandles || []).filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low);
  const higherPivots = higherCandles.length >= 20 ? findPivots(higherCandles) : [];
  const higherHighs = higherPivots.filter((p) => p.kind === "high").slice(-2);
  const higherLows = higherPivots.filter((p) => p.kind === "low").slice(-2);
  let higherTrend: MarketForecast["structure"]["higherTimeframeTrend"] = "unavailable";
  if (higherHighs.length === 2 && higherLows.length === 2) {
    if (higherHighs[1].price > higherHighs[0].price && higherLows[1].price > higherLows[0].price) higherTrend = "bullish";
    else if (higherHighs[1].price < higherHighs[0].price && higherLows[1].price < higherLows[0].price) higherTrend = "bearish";
    else higherTrend = "range";
  } else if (higherCandles.length >= 20) higherTrend = "unclear";

  const multiTimeframe = Object.entries(input.multiTimeframeCandles || {}).map(([tf, series]) => {
    const valid = (series || []).filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low);
    return { timeframe: tf, trend: classifyStructure(valid), candles: valid.length, latestClose: valid.length ? valid[valid.length - 1].close : null, status: valid.length >= 20 ? "available" as const : "unavailable" as const };
  }).sort((a, b) => ["5min", "15min", "1h", "4h", "1day"].indexOf(a.timeframe) - ["5min", "15min", "1h", "4h", "1day"].indexOf(b.timeframe));

  const priorHigh = highs.length ? highs[highs.length - 1].price : null;
  const priorLow = lows.length ? lows[lows.length - 1].price : null;
  const previousClose = candles[candles.length - 2].close;
  const breakType: MarketForecast["structure"]["breakType"] = priorHigh != null && previousClose <= priorHigh && last.close > priorHigh
    ? (trend === "bullish" ? "bullish-bos" : "bullish-choch")
    : priorLow != null && previousClose >= priorLow && last.close < priorLow
      ? (trend === "bearish" ? "bearish-bos" : "bearish-choch")
      : "none";
  const recent = candles.slice(-12, -1);
  const sweptHigh = priorHigh != null && last.high > priorHigh && last.close < priorHigh;
  const sweptLow = priorLow != null && last.low < priorLow && last.close > priorLow;
  const sweep: MarketForecast["liquidity"]["sweep"] = sweptHigh ? "buy-side" : sweptLow ? "sell-side" : "none";

  const zones: MarketForecast["zones"] = [];
  for (const pivot of [...pivots].slice(-12).reverse()) {
    const c = candles[pivot.index];
    const type = pivot.kind === "low" ? "demand" : "supply";
    const zone = { type, low: c.low, high: c.high, distancePercent: Number((Math.abs(last.close - (c.low + c.high) / 2) / last.close * 100).toFixed(3)) } as const;
    if (zones.filter((z) => z.type === type).length < 3 && !zones.some((z) => z.type === type && Math.abs(z.low - zone.low) / last.close < 0.0015)) zones.push(zone);
  }
  zones.sort((a, b) => a.distancePercent - b.distancePercent);

  const ranges = candles.slice(-20).map(candleRange);
  const typicalRange = median(ranges);
  const recentLow = Math.min(...recent.map((c) => c.low));
  const recentHigh = Math.max(...recent.map((c) => c.high));
  const structureNotes: string[] = [];
  structureNotes.push(trend === "unclear" ? "Swing sequence is not yet clear." : `Recent confirmed swing sequence indicates ${trend} structure.`);
  structureNotes.push(higherTrend === "unavailable" ? "Higher-timeframe candles were not available for alignment." : `Higher-timeframe (${input.higherTimeframe || "HTF"}) structure is ${higherTrend}.`);
  if (priorHigh != null) structureNotes.push(`Latest confirmed swing high: ${priorHigh.toFixed(2)}.`);
  if (priorLow != null) structureNotes.push(`Latest confirmed swing low: ${priorLow.toFixed(2)}.`);
  if (last.close > (priorHigh ?? Infinity)) structureNotes.push("Close is above the latest confirmed swing high (potential bullish break).");
  if (last.close < (priorLow ?? -Infinity)) structureNotes.push("Close is below the latest confirmed swing low (potential bearish break).");
  if (breakType !== "none") structureNotes.push(`Latest structure event: ${breakType.toUpperCase()} (close beyond a confirmed swing level).`);
  if (multiTimeframe.length) structureNotes.push(`Multi-timeframe structure checked across ${multiTimeframe.filter((x) => x.status === "available").length}/${multiTimeframe.length} requested intervals.`);

  const currentVector = patternVector(candles, candles.length - 1);
  const historical = historicalMatches(candles, currentVector, typicalRange);
  const backtest = walkForwardBacktest(candles);
  const strategyBacktest = liquidityConfirmationBacktest(candles, 12, input.comparisonCandles || [], input.multiTimeframeCandles || {});
  const strategyByTimeframe = Object.entries(input.multiTimeframeCandles || {}).map(([timeframe, series]) => {
    const validSeries = (series || []).filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low && c.time).slice(-2500);
    const report = validSeries.length >= 45 ? liquidityConfirmationBacktest(validSeries) : null;
    return {
      timeframe, candles: validSeries.length,
      trades: report?.trades ?? 0,
      outOfSampleTrades: report?.outOfSample.trades ?? 0,
      outOfSampleExpectancyR: report?.outOfSample.expectancyR ?? null,
      outOfSampleWinRate: report?.outOfSample.winRate ?? null,
      status: report && report.outOfSample.trades > 0 ? "available" as const : "insufficient" as const,
    };
  }).sort((a, b) => ["5min", "15min", "1h", "4h", "1day"].indexOf(a.timeframe) - ["5min", "15min", "1h", "4h", "1day"].indexOf(b.timeframe));
  const comparisonSeries = (input.comparisonCandles || []).filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low && c.time).slice(-2500);
  const comparisonReport = comparisonSeries.length >= 45 ? liquidityConfirmationBacktest(comparisonSeries) : null;
  const strategyByInstrument = [
    { symbol: input.symbol, candles: candles.length, report: strategyBacktest },
    { symbol: input.symbol === "XAU/USD" ? "XAG/USD" : "XAU/USD", candles: comparisonSeries.length, report: comparisonReport },
  ].map(({ symbol, candles: count, report }) => ({
    symbol, candles: count, trades: report?.trades ?? 0,
    outOfSampleTrades: report?.outOfSample.trades ?? 0,
    outOfSampleExpectancyR: report?.outOfSample.expectancyR ?? null,
    outOfSampleWinRate: report?.outOfSample.winRate ?? null,
    status: report && report.outOfSample.trades > 0 ? "available" as const : "insufficient" as const,
  }));
  const evidence: string[] = [];
  if (trend !== "unclear") evidence.push(`${trend} swing structure`);
  if (sweep !== "none") evidence.push(`${sweep} liquidity sweep and reclaim`);
  if (historical.samples >= 5 && historical.winRate != null) evidence.push(`${historical.samples} similar historical formations; ${historical.winRate}% resolved win rate`);
  const nearestZone = zones[0];
  if (nearestZone) evidence.push(`Nearest ${nearestZone.type} zone is ${nearestZone.distancePercent}% from price`);

  let directionalScore = 0;
  if (trend === "bullish") directionalScore += 1;
  if (trend === "bearish") directionalScore -= 1;
  if (higherTrend === "bullish") directionalScore += 0.75;
  if (higherTrend === "bearish") directionalScore -= 0.75;
  const alignedFrames = multiTimeframe.filter((x) => x.status === "available");
  const mtfBull = alignedFrames.filter((x) => x.trend === "bullish").length;
  const mtfBear = alignedFrames.filter((x) => x.trend === "bearish").length;
  if (alignedFrames.length >= 2 && mtfBull > mtfBear) directionalScore += Math.min(0.5, (mtfBull - mtfBear) * 0.12);
  if (alignedFrames.length >= 2 && mtfBear > mtfBull) directionalScore -= Math.min(0.5, (mtfBear - mtfBull) * 0.12);
  if (sweep === "sell-side") directionalScore += 1.25;
  if (sweep === "buy-side") directionalScore -= 1.25;
  if (historical.samples >= 5 && historical.winRate != null) {
    // Pattern outcomes inform confidence, but never determine direction on their own.
    const recentBias = candles[candles.length - 1].close >= candles[candles.length - 2].close ? 0.25 : -0.25;
    directionalScore += (historical.winRate - 50) / 100 * recentBias;
  }
  // Liquidity-to-forecast confirmation: score independent, observable candle-derived
  // conditions. A directional bias alone is never sufficient to publish BUY/SELL.
  const candidateDirection: "bullish" | "bearish" | "neutral" = directionalScore >= 0.5 ? "bullish" : directionalScore <= -0.5 ? "bearish" : "neutral";
  const bullish = candidateDirection === "bullish";
  const alignedSweep = (bullish && sweep === "sell-side") || (!bullish && candidateDirection === "bearish" && sweep === "buy-side");
  const alignedBreak = bullish ? breakType === "bullish-bos" || breakType === "bullish-choch" : candidateDirection === "bearish" && (breakType === "bearish-bos" || breakType === "bearish-choch");
  const lastBody = Math.abs(last.close - last.open);
  const lastRange = candleRange(last);
  const displacementRatio = lastRange / Math.max(typicalRange, 1e-9);
  const alignedDisplacement = displacementRatio >= 1.45 && lastBody / lastRange >= 0.55 && (bullish ? last.close > last.open : candidateDirection === "bearish" && last.close < last.open);
  const htfAligned = (bullish && higherTrend === "bullish") || (candidateDirection === "bearish" && higherTrend === "bearish");
  const frameVotes = alignedFrames.filter((frame) => frame.trend === candidateDirection).length;
  const frameOpposition = alignedFrames.filter((frame) => frame.trend !== candidateDirection && frame.trend !== "range" && frame.trend !== "unclear").length;
  const mtfAligned = candidateDirection !== "neutral" && frameVotes >= 2 && frameVotes > frameOpposition;
  let nearbyFvg = false;
  if (candidateDirection !== "neutral") {
    for (let i = Math.max(2, candles.length - 14); i < candles.length; i++) {
      const first = candles[i - 2], third = candles[i];
      const low = bullish ? first.high : third.high;
      const high = bullish ? third.low : first.low;
      const validGap = bullish ? third.low > first.high : third.high < first.low;
      if (validGap && last.close >= low - typicalRange * 1.25 && last.close <= high + typicalRange * 1.25) { nearbyFvg = true; break; }
    }
  }
  const components = candidateDirection === "neutral" ? [] : [
    { name: "Liquidity sweep and reclaim", points: alignedSweep ? 25 : sweep === "none" ? 0 : 0, maximum: 25, state: alignedSweep ? "aligned" as const : sweep === "none" ? "missing" as const : "opposed" as const },
    { name: "Displacement candle", points: alignedDisplacement ? 20 : displacementRatio >= 1.45 ? 0 : 0, maximum: 20, state: alignedDisplacement ? "aligned" as const : displacementRatio >= 1.45 ? "opposed" as const : "missing" as const },
    { name: "BOS / CHoCH close", points: alignedBreak ? 20 : breakType === "none" ? 0 : 0, maximum: 20, state: alignedBreak ? "aligned" as const : breakType === "none" ? "missing" as const : "opposed" as const },
    { name: "Higher-timeframe structure", points: htfAligned ? 15 : higherTrend === "unavailable" || higherTrend === "unclear" ? 0 : 0, maximum: 15, state: htfAligned ? "aligned" as const : higherTrend === "unavailable" || higherTrend === "unclear" ? "missing" as const : "opposed" as const },
    { name: "Multi-timeframe agreement", points: mtfAligned ? 10 : alignedFrames.length < 2 ? 0 : 0, maximum: 10, state: mtfAligned ? "aligned" as const : alignedFrames.length < 2 ? "missing" as const : "opposed" as const },
    { name: "Nearby directional FVG", points: nearbyFvg ? 10 : 0, maximum: 10, state: nearbyFvg ? "aligned" as const : "missing" as const },
  ];
  const confirmationScore = components.reduce((sum, item) => sum + item.points, 0);
  const alignedCount = components.filter((item) => item.state === "aligned").length;
  const hasTrigger = alignedSweep || alignedBreak;
  const setupConfirmed = candidateDirection !== "neutral" && confirmationScore >= 60 && alignedCount >= 3 && hasTrigger && alignedDisplacement;
  const confirmation: MarketForecast["confirmation"] = {
    direction: candidateDirection,
    score: confirmationScore,
    status: setupConfirmed ? "confirmed" : confirmationScore >= 35 ? "developing" : "weak",
    components,
    rationale: [
      `${alignedCount} of ${components.length} confirmation checks align with the ${candidateDirection} bias.`,
      hasTrigger ? "A directional liquidity sweep or structure break is present." : "No directional sweep or BOS/CHoCH trigger is confirmed.",
      alignedDisplacement ? `Directional displacement is present (${displacementRatio.toFixed(2)}× typical range).` : "A matching displacement candle is still required.",
    ],
    rule: "BUY/SELL requires score ≥60/100, at least three aligned checks, a matching sweep or BOS/CHoCH trigger, and directional displacement. Otherwise the forecast remains WAIT.",
  };
  const directionalCandidate: ForecastAction = directionalScore >= 1.25 ? "BUY" : directionalScore <= -1.25 ? "SELL" : "WAIT";
  const action: ForecastAction = setupConfirmed && ((candidateDirection === "bullish" && directionalCandidate === "BUY") || (candidateDirection === "bearish" && directionalCandidate === "SELL")) ? directionalCandidate : "WAIT";
  const riskDirection = candidateDirection === "bullish" ? 1 : candidateDirection === "bearish" ? -1 : 0;
  const rawStopAnchor = riskDirection > 0 ? Math.min(recentLow, priorLow ?? recentLow) : riskDirection < 0 ? Math.max(recentHigh, priorHigh ?? recentHigh) : last.close;
  const stopAnchor = riskDirection > 0 && rawStopAnchor >= last.close ? last.close - typicalRange
    : riskDirection < 0 && rawStopAnchor <= last.close ? last.close + typicalRange : rawStopAnchor;
  const riskDistance = riskDirection === 0 ? 0 : Math.max(Math.abs(last.close - stopAnchor) + typicalRange * 0.1, typicalRange * 0.8);
  const riskPlanAvailable = riskDirection !== 0 && finite(riskDistance) && riskDistance > 0 && riskDistance <= typicalRange * 4;
  const entryPad = typicalRange * 0.12;
  const planStop = riskPlanAvailable ? Number((last.close - riskDirection * riskDistance).toFixed(3)) : null;
  const planTargets = riskPlanAvailable ? [1, 2, 3].map((r) => Number((last.close + riskDirection * riskDistance * r).toFixed(3))) : [];
  const riskPlan: MarketForecast["riskPlan"] = {
    status: !riskPlanAvailable ? "unavailable" : action === "WAIT" ? "conditional" : "active",
    direction: candidateDirection,
    entry: riskPlanAvailable ? Number(last.close.toFixed(3)) : null,
    stop: planStop,
    targets: planTargets,
    riskDistance: riskPlanAvailable ? Number(riskDistance.toFixed(3)) : null,
    methodology: `Reference entry at latest broker candle close; stop beyond recent confirmed swing with 0.1× median candle-range buffer and minimum 0.8× range; targets at 1R, 2R and 3R. ${action === "WAIT" ? "Conditional planning levels only; WAIT is not an entry signal." : "Levels accompany a confirmed forecast and still require broker spread/slippage checks."}`
  };
  const entryZone = action === "WAIT" ? null : { low: Number((last.close - entryPad).toFixed(3)), high: Number((last.close + entryPad).toFixed(3)) };
  const stopLoss = action === "WAIT" ? null : planStop;
  const targets = action === "WAIT" ? [] : planTargets;

  const uncertainty: string[] = [];
  if (candles.length < 100) uncertainty.push("Limited candle history; pattern statistics may be unstable.");
  if (historical.samples < 5) uncertainty.push("Fewer than five sufficiently similar historical patterns were found.");
  if (input.mode !== "live" && input.mode !== "closed") uncertainty.push(`Broker data mode is ${input.mode}; confirm data provenance before relying on this forecast.`);
  if (input.mode === "closed") uncertainty.push("Broker reports no live quote; this forecast is anchored to the last available candle close.");
  if (higherTrend === "unavailable" || higherTrend === "unclear") uncertainty.push("Higher-timeframe alignment is unavailable or inconclusive.");
  if (multiTimeframe.filter((x) => x.status === "available").length < 3) uncertainty.push("Fewer than three requested timeframes returned enough candles for structure classification.");
  if (breakType === "none") uncertainty.push("No confirmed close beyond the latest swing level; BOS/CHoCH is not confirmed.");
  if (input.dataNote) uncertainty.push(input.dataNote);
  if (sweep === "none") uncertainty.push("No recent confirmed liquidity sweep was detected.");
  if (trend === "range" || trend === "unclear") uncertainty.push("Market structure does not show a clean directional sequence.");
  if (!setupConfirmed) uncertainty.push("Liquidity-to-forecast confirmation threshold was not met; directional bias is informational and forecast remains WAIT.");
  const confidence = Math.round(clamp(confirmationScore * 0.72 + Math.min(historical.samples, 15) * 0.8, 0, 82));
  const validity: MarketForecast["validity"] = action === "WAIT" || candles.length < 60 || historical.samples < 3 ? "insufficient" : uncertainty.length >= 3 ? "caution" : "valid";

  return {
    action, symbol: input.symbol, broker: input.broker, timeframe: input.timeframe,
    generatedAt: new Date().toISOString(), currentPrice: last.close,
    entryZone, stopLoss, targets, riskPlan, strategyBacktest, strategyByTimeframe, strategyByInstrument, confidence, confirmation, validity, uncertainty,
    structure: { trend, higherTimeframeTrend: higherTrend, higherTimeframe: input.higherTimeframe || null, latestHigh: priorHigh, latestLow: priorLow, explanation: structureNotes, breakType },
    multiTimeframe,
    liquidity: { sweep, explanation: sweptHigh ? "Price traded above a confirmed swing high and closed back below it, consistent with a buy-side liquidity sweep." : sweptLow ? "Price traded below a confirmed swing low and closed back above it, consistent with a sell-side liquidity sweep." : "No sweep-and-reclaim of the latest confirmed swing extremes was detected in the latest candle." },
    zones, backtest, historical: { ...historical, methodology: "Nearest five-candle OHLC shape matches in prior history; each sample is evaluated forward for up to 12 bars using a 1.5R target and 1R stop. Same-candle double hits are counted as losses. Unresolved samples remain visible." },
    evidence, data: { source: input.source, mode: input.mode, candles: candles.length, latestCandle: last.time, oldestCandle: input.historyOldestCandle || candles[0]?.time || null, requestedCandles: input.historyRequestedBars || candles.length, note: input.dataNote || "Broker candle history; candle volume is tick volume where supplied, not centralized exchange volume.", quality: { rawCandles: dataQuality.rawCandles, validCandles: dataQuality.validCandles, invalidOhlc: dataQuality.invalidOhlc, invalidTimestamp: dataQuality.invalidTimestamp, duplicateTimestamps: dataQuality.duplicateTimestamps, outOfOrderTimestamps: dataQuality.outOfOrderTimestamps, missingVolume: dataQuality.missingVolume, volumeCoveragePercent: dataQuality.volumeCoveragePercent, timezoneOffsetCoveragePercent: dataQuality.timezoneOffsetCoveragePercent, intervalMinutes: dataQuality.intervalMinutes, medianIntervalMinutes: dataQuality.medianIntervalMinutes, internalGapCount: dataQuality.internalGapCount, longClosureGapCount: dataQuality.longClosureGapCount, maxGapHours: dataQuality.maxGapHours, timestampAssumption: dataQuality.timestampAssumption } },
  };
}
