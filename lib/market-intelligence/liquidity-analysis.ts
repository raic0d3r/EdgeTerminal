import type { MarketCandle } from "@/lib/providers/market";

export type LiquidityMap = {
  equalHighs: number[];
  equalLows: number[];
  pools: Array<{ side: "buy-side" | "sell-side"; level: number; touches: number; distancePercent: number; strength: "high" | "medium" }>; 
  fairValueGaps: Array<{ direction: "bullish" | "bearish"; low: number; high: number; time: string; strength: number; status: "open" | "partially-mitigated" | "mitigated"; distancePercent: number }>;
  orderBlocks: Array<{ direction: "bullish" | "bearish"; low: number; high: number; time: string; status: "active" | "mitigated" | "breaker"; displacementRatio: number }>;
  sweepEvents: Array<{ side: "buy-side" | "sell-side"; level: number; time: string; confirmed: boolean; quality: "strong" | "developing" }>;
  displacement: "bullish" | "bearish" | "none";
  displacementRatio: number;
  sweep: "buy-side" | "sell-side" | "both" | "none";
  brokerVolume: { available: boolean; latest: number | null; median: number | null; relative: number | null; directionalBias: "buyer-leaning" | "seller-leaning" | "balanced" | "unavailable" };
  note: string;
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const rangeOf = (c: MarketCandle) => Math.max(c.high - c.low, 1e-9);

type Pivot = { index: number; price: number; side: "buy-side" | "sell-side" };
function confirmedPivots(candles: MarketCandle[]): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (c.high > candles[i - 1].high && c.high > candles[i - 2].high && c.high > candles[i + 1].high && c.high > candles[i + 2].high) pivots.push({ index: i, price: c.high, side: "buy-side" });
    if (c.low < candles[i - 1].low && c.low < candles[i - 2].low && c.low < candles[i + 1].low && c.low < candles[i + 2].low) pivots.push({ index: i, price: c.low, side: "sell-side" });
  }
  return pivots;
}

/** Broker-OHLC liquidity context. These are inferred price zones, not a view of resting orders. */
export function analyzeLiquidity(candles: readonly MarketCandle[]): LiquidityMap {
  const valid = candles.filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite) && c.high >= c.low).slice(-180);
  const emptyVolume: LiquidityMap["brokerVolume"] = { available: false, latest: null, median: null, relative: null, directionalBias: "unavailable" };
  if (valid.length < 12) return { equalHighs: [], equalLows: [], pools: [], fairValueGaps: [], orderBlocks: [], sweepEvents: [], displacement: "none", displacementRatio: 0, sweep: "none", brokerVolume: emptyVolume, note: "At least 12 valid broker candles are required. All zones are candle-derived estimates, not resting-order data." };

  const last = valid[valid.length - 1];
  const medianRange = median(valid.slice(0, -1).map(rangeOf)) || 1e-9;
  const lastRange = rangeOf(last);
  const displacementRatio = Number((lastRange / medianRange).toFixed(2));
  const bodyRatio = Math.abs(last.close - last.open) / lastRange;
  const displacement = displacementRatio >= 1.6 && bodyRatio >= 0.58 ? (last.close > last.open ? "bullish" : last.close < last.open ? "bearish" : "none") : "none";

  const pivots = confirmedPivots(valid);
  const tolerance = medianRange * 0.14;
  const makePools = (side: Pivot["side"]) => {
    const candidates = pivots.filter(p => p.side === side);
    const pools: LiquidityMap["pools"] = [];
    for (const pivot of candidates.slice(-24)) {
      const members = candidates.filter(p => Math.abs(p.price - pivot.price) <= tolerance);
      if (members.length < 2 || pools.some(p => Math.abs(p.level - pivot.price) <= tolerance)) continue;
      const level = median(members.map(p => p.price));
      pools.push({ side, level: Number(level.toFixed(5)), touches: members.length, distancePercent: Number((Math.abs(last.close - level) / Math.max(Math.abs(last.close), 1e-9) * 100).toFixed(3)), strength: members.length >= 3 ? "high" : "medium" });
    }
    return pools.sort((a, b) => b.touches - a.touches || a.distancePercent - b.distancePercent).slice(0, 6);
  };
  const pools = [...makePools("buy-side"), ...makePools("sell-side")].sort((a, b) => a.distancePercent - b.distancePercent);
  const equalHighs = pools.filter(p => p.side === "buy-side").map(p => p.level);
  const equalLows = pools.filter(p => p.side === "sell-side").map(p => p.level);

  const fairValueGaps: LiquidityMap["fairValueGaps"] = [];
  for (let i = Math.max(2, valid.length - 45); i < valid.length; i++) {
    const first = valid[i - 2], middle = valid[i - 1], third = valid[i];
    let direction: "bullish" | "bearish" | null = null;
    let low = 0, high = 0;
    if (third.low > first.high) { direction = "bullish"; low = first.high; high = third.low; }
    else if (third.high < first.low) { direction = "bearish"; low = third.high; high = first.low; }
    if (!direction) continue;
    const gap = high - low;
    let touched = false, fullyFilled = false;
    for (let j = i + 1; j < valid.length; j++) {
      const c = valid[j];
      if (c.low < high && c.high > low) touched = true;
      if (direction === "bullish" ? c.low <= low : c.high >= high) fullyFilled = true;
    }
    const strength = Math.max(1, Math.min(5, Math.round((gap / medianRange) * 2 + (rangeOf(middle) / medianRange >= 1.5 ? 1 : 0))));
    fairValueGaps.push({ direction, low: Number(low.toFixed(5)), high: Number(high.toFixed(5)), time: third.time, strength, status: fullyFilled ? "mitigated" : touched ? "partially-mitigated" : "open", distancePercent: Number((Math.abs(last.close - (low + high) / 2) / Math.max(Math.abs(last.close), 1e-9) * 100).toFixed(3)) });
  }

  // Order block proxy: last opposing candle before a strong close through a recent swing.
  const orderBlocks: LiquidityMap["orderBlocks"] = [];
  for (let i = Math.max(5, valid.length - 35); i < valid.length - 1; i++) {
    const impulse = valid[i];
    const impulseRatio = rangeOf(impulse) / medianRange;
    if (impulseRatio < 1.45 || Math.abs(impulse.close - impulse.open) / rangeOf(impulse) < 0.55) continue;
    const recentBefore = valid.slice(Math.max(0, i - 8), i);
    const brokeHigh = impulse.close > Math.max(...recentBefore.slice(0, -1).map(c => c.high));
    const brokeLow = impulse.close < Math.min(...recentBefore.slice(0, -1).map(c => c.low));
    const direction = impulse.close > impulse.open && brokeHigh ? "bullish" : impulse.close < impulse.open && brokeLow ? "bearish" : null;
    if (!direction) continue;
    const opposingIndex = [...Array(Math.min(5, i)).keys()].map(n => i - 1 - n).find(index => direction === "bullish" ? valid[index].close < valid[index].open : valid[index].close > valid[index].open);
    if (opposingIndex == null) continue;
    const origin = valid[opposingIndex];
    const low = Math.min(origin.open, origin.close), high = Math.max(origin.open, origin.close);
    const subsequent = valid.slice(opposingIndex + 1);
    const breached = subsequent.some(c => direction === "bullish" ? c.close < low : c.close > high);
    const entered = subsequent.some(c => c.low <= high && c.high >= low);
    orderBlocks.push({ direction, low: Number(low.toFixed(5)), high: Number(high.toFixed(5)), time: origin.time, status: breached ? "breaker" : entered ? "mitigated" : "active", displacementRatio: Number(impulseRatio.toFixed(2)) });
  }
  const uniqueBlocks = orderBlocks.filter((block, index, all) => all.findIndex(x => x.direction === block.direction && x.time === block.time) === index).slice(-6).reverse();

  const sweepEvents: LiquidityMap["sweepEvents"] = [];
  const sweepStart = Math.max(2, valid.length - 6);
  for (let i = sweepStart; i < valid.length; i++) {
    const c = valid[i];
    const prior = valid.slice(Math.max(0, i - 35), i);
    const priorPivots = confirmedPivots(prior);
    const buyLevel = priorPivots.filter(p => p.side === "buy-side").slice(-1)[0]?.price;
    const sellLevel = priorPivots.filter(p => p.side === "sell-side").slice(-1)[0]?.price;
    const sweptBuy = buyLevel != null && c.high > buyLevel && c.close < buyLevel;
    const sweptSell = sellLevel != null && c.low < sellLevel && c.close > sellLevel;
    for (const event of [{ hit: sweptBuy, side: "buy-side" as const, level: buyLevel }, { hit: sweptSell, side: "sell-side" as const, level: sellLevel }]) {
      if (!event.hit || event.level == null) continue;
      const next = valid[i + 1];
      const confirmed = !!next && (event.side === "buy-side" ? next.close < c.close : next.close > c.close);
      sweepEvents.push({ side: event.side, level: Number(event.level.toFixed(5)), time: c.time, confirmed, quality: confirmed ? "strong" : "developing" });
    }
  }
  const recentSweeps = sweepEvents.slice(-4);
  const hasBuy = recentSweeps.some(s => s.side === "buy-side"), hasSell = recentSweeps.some(s => s.side === "sell-side");
  const sweep: LiquidityMap["sweep"] = hasBuy && hasSell ? "both" : hasBuy ? "buy-side" : hasSell ? "sell-side" : "none";

  const volumeBars = valid.filter(c => typeof c.volume === "number" && Number.isFinite(c.volume) && c.volume >= 0);
  const volumes = volumeBars.map(c => c.volume as number);
  const medianVolume = volumes.length ? median(volumes) : null;
  const latestVolume = typeof last.volume === "number" && Number.isFinite(last.volume) ? last.volume : null;
  const relativeVolume = latestVolume != null && medianVolume != null && medianVolume > 0 ? Number((latestVolume / medianVolume).toFixed(2)) : null;
  const upVolume = volumeBars.filter(c => c.close > c.open).reduce((sum, c) => sum + (c.volume || 0), 0);
  const downVolume = volumeBars.filter(c => c.close < c.open).reduce((sum, c) => sum + (c.volume || 0), 0);
  const total = upVolume + downVolume;
  const bias = total ? (upVolume - downVolume) / total : 0;
  const directionalBias: LiquidityMap["brokerVolume"]["directionalBias"] = !volumeBars.length ? "unavailable" : bias > 0.12 ? "buyer-leaning" : bias < -0.12 ? "seller-leaning" : "balanced";
  const brokerVolume = { available: volumeBars.length > 0, latest: latestVolume, median: medianVolume, relative: relativeVolume, directionalBias };

  return {
    equalHighs, equalLows, pools, fairValueGaps: fairValueGaps.slice(-8).reverse(), orderBlocks: uniqueBlocks, sweepEvents: recentSweeps.reverse(),
    displacement, displacementRatio, sweep, brokerVolume,
    note: "Liquidity pools, sweeps, FVGs and order-block candidates are inferred from broker OHLC candles. Order blocks are candle-pattern proxies, not verified institutional orders or resting liquidity. Volume is broker-reported tick volume; candle-direction bias is not actual buyer/seller aggressor flow or trader positioning. Sweep confirmation requires a subsequent candle close in the rejection direction.",
  };
}
