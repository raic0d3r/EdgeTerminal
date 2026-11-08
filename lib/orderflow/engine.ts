/**
 * Provider-neutral order-flow calculations.
 *
 * IMPORTANT: `side` must describe the aggressor (the side that crossed the
 * spread), not simply whether the candle closed up or down. Do not feed OHLC
 * candle volume into this engine and label the result as real bid/ask volume.
 */

export type AggressorSide = "buy" | "sell";

export type TradePrint = {
  /** Exchange/provider event timestamp in milliseconds since epoch. */
  timestamp: number;
  /** Executed price, not bid/ask quote. */
  price: number;
  /** Executed quantity in the instrument's native units/contracts. */
  quantity: number;
  /** Aggressor side supplied by the feed or a documented classifier. */
  side: AggressorSide;
};

export type FootprintLevel = {
  price: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  delta: number;
  /** Diagonal ask/bid comparison against the immediately lower price row. */
  buyImbalance: boolean;
  /** Diagonal bid/ask comparison against the immediately higher price row. */
  sellImbalance: boolean;
};

export type FootprintBar = {
  startTime: number;
  endTime: number;
  levels: FootprintLevel[]; // descending price order
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  delta: number;
  poc: number | null;
  cvd: number;
};

export type FootprintOptions = {
  /** Minimum price increment used to group executions. */
  tickSize: number;
  /** Bar duration in milliseconds. */
  intervalMs: number;
  /** Diagonal imbalance ratio. Common starting value: 3. */
  imbalanceRatio?: number;
  /** Minimum volume on the dominant side before an imbalance is flagged. */
  minImbalanceVolume?: number;
};

function assertValidTrade(trade: TradePrint): void {
  if (!Number.isFinite(trade.timestamp)) throw new Error("Trade timestamp must be finite");
  if (!Number.isFinite(trade.price) || trade.price <= 0) throw new Error("Trade price must be positive");
  if (!Number.isFinite(trade.quantity) || trade.quantity <= 0) throw new Error("Trade quantity must be positive");
  if (trade.side !== "buy" && trade.side !== "sell") throw new Error("Trade aggressor side is required");
}

function priceKey(price: number, tickSize: number): number {
  return Number((Math.round(price / tickSize) * tickSize).toFixed(10));
}

/** Aggregate actual trade prints into time bars and price levels. */
export function buildFootprint(
  input: readonly TradePrint[],
  options: FootprintOptions,
): FootprintBar[] {
  const { tickSize, intervalMs } = options;
  if (!Number.isFinite(tickSize) || tickSize <= 0) throw new Error("tickSize must be positive");
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("intervalMs must be positive");

  const ratio = options.imbalanceRatio ?? 3;
  const minVolume = options.minImbalanceVolume ?? 1;
  if (ratio <= 1) throw new Error("imbalanceRatio must be greater than 1");

  const sorted = [...input].sort((a, b) => a.timestamp - b.timestamp);
  const bars = new Map<number, Map<number, { bid: number; ask: number }>>();

  for (const trade of sorted) {
    assertValidTrade(trade);
    const start = Math.floor(trade.timestamp / intervalMs) * intervalMs;
    const price = priceKey(trade.price, tickSize);
    let levels = bars.get(start);
    if (!levels) {
      levels = new Map();
      bars.set(start, levels);
    }
    const level = levels.get(price) ?? { bid: 0, ask: 0 };
    if (trade.side === "buy") level.ask += trade.quantity;
    else level.bid += trade.quantity;
    levels.set(price, level);
  }

  let runningCvd = 0;
  return [...bars.entries()].sort((a, b) => a[0] - b[0]).map(([startTime, rawLevels]) => {
    const prices = [...rawLevels.keys()].sort((a, b) => b - a);
    const levels: FootprintLevel[] = prices.map((price, index) => {
      const value = rawLevels.get(price)!;
      // Diagonal comparison: ask at this price vs bid one tick below;
      // bid at this price vs ask one tick above.
      const lower = rawLevels.get(priceKey(price - tickSize, tickSize));
      const higher = rawLevels.get(priceKey(price + tickSize, tickSize));
      const buyReference = lower?.bid ?? 0;
      const sellReference = higher?.ask ?? 0;
      return {
        price,
        bidVolume: value.bid,
        askVolume: value.ask,
        totalVolume: value.bid + value.ask,
        delta: value.ask - value.bid,
        buyImbalance: value.ask >= minVolume && (buyReference === 0 || value.ask >= buyReference * ratio),
        sellImbalance: value.bid >= minVolume && (sellReference === 0 || value.bid >= sellReference * ratio),
      };
    });

    const bidVolume = levels.reduce((sum, level) => sum + level.bidVolume, 0);
    const askVolume = levels.reduce((sum, level) => sum + level.askVolume, 0);
    const totalVolume = bidVolume + askVolume;
    const delta = askVolume - bidVolume;
    runningCvd += delta;
    const pocLevel = levels.reduce<FootprintLevel | null>(
      (best, level) => !best || level.totalVolume > best.totalVolume ? level : best,
      null,
    );
    return {
      startTime,
      endTime: startTime + intervalMs,
      levels,
      bidVolume,
      askVolume,
      totalVolume,
      delta,
      poc: pocLevel?.price ?? null,
      cvd: runningCvd,
    };
  });
}

export type VolumeProfileRow = { price: number; volume: number };

/** Build volume-at-price from actual executions, not candle volume estimates. */
export function buildVolumeProfile(
  trades: readonly TradePrint[],
  tickSize: number,
): VolumeProfileRow[] {
  if (!Number.isFinite(tickSize) || tickSize <= 0) throw new Error("tickSize must be positive");
  const volume = new Map<number, number>();
  for (const trade of trades) {
    assertValidTrade(trade);
    const price = priceKey(trade.price, tickSize);
    volume.set(price, (volume.get(price) ?? 0) + trade.quantity);
  }
  return [...volume.entries()]
    .map(([price, quantity]) => ({ price, volume: quantity }))
    .sort((a, b) => b.price - a.price);
}

/** Calculate POC and a value area expanded from POC to the requested share. */
export function calculateValueArea(
  profile: readonly VolumeProfileRow[],
  valueAreaPercent = 70,
): { poc: number | null; vah: number | null; val: number | null } {
  if (valueAreaPercent <= 0 || valueAreaPercent > 100) throw new Error("valueAreaPercent must be in (0, 100]");
  if (!profile.length) return { poc: null, vah: null, val: null };

  const rows = [...profile].sort((a, b) => a.price - b.price);
  const total = rows.reduce((sum, row) => sum + row.volume, 0);
  if (total <= 0) return { poc: null, vah: null, val: null };
  let pocIndex = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].volume > rows[pocIndex].volume) pocIndex = i;

  let low = pocIndex;
  let high = pocIndex;
  let accumulated = rows[pocIndex].volume;
  const target = total * (valueAreaPercent / 100);
  while (accumulated < target && (low > 0 || high < rows.length - 1)) {
    const below = low > 0 ? rows[low - 1].volume : -1;
    const above = high < rows.length - 1 ? rows[high + 1].volume : -1;
    if (above > below) {
      high++;
      accumulated += rows[high].volume;
    } else {
      low--;
      accumulated += rows[low].volume;
    }
  }
  return { poc: rows[pocIndex].price, vah: rows[high].price, val: rows[low].price };
}

export type AbsorptionCandidate = {
  timestamp: number;
  price: number;
  type: "buy-absorption" | "sell-absorption";
  aggressorSide: AggressorSide;
  aggressorVolume: number;
  opposingVolume: number;
  delta: number;
  followThroughTicks: number;
  strength: "low" | "moderate" | "high";
  evidence: string;
};

export type AbsorptionOptions = {
  tickSize: number;
  intervalMs?: number;
  lookaheadTrades?: number;
  minAggressorVolume?: number;
  dominanceRatio?: number;
  maxFollowThroughTicks?: number;
};

/**
 * Finds heuristic absorption candidates in chronological trade prints.
 * Aggressive selling without subsequent downside progress suggests possible
 * buy absorption; aggressive buying without upside progress suggests possible
 * sell absorption. This is a candidate detector, not proof of passive orders.
 */
export function detectAbsorptionCandidates(
  input: readonly TradePrint[],
  options: AbsorptionOptions,
): AbsorptionCandidate[] {
  const { tickSize } = options;
  if (!Number.isFinite(tickSize) || tickSize <= 0) throw new Error("tickSize must be positive");
  const intervalMs = options.intervalMs ?? 5 * 60 * 1000;
  const lookahead = Math.max(1, Math.floor(options.lookaheadTrades ?? 5));
  const minVolume = options.minAggressorVolume ?? 10;
  const dominance = options.dominanceRatio ?? 1.5;
  const maxProgress = options.maxFollowThroughTicks ?? 1;
  if (dominance <= 1) throw new Error("dominanceRatio must be greater than 1");

  const trades = [...input].sort((a, b) => a.timestamp - b.timestamp);
  trades.forEach(assertValidTrade);
  const bars = new Map<number, Map<number, { buy: number; sell: number; lastIndex: number }>>();
  trades.forEach((trade, index) => {
    const barStart = Math.floor(trade.timestamp / intervalMs) * intervalMs;
    const price = priceKey(trade.price, tickSize);
    let levels = bars.get(barStart);
    if (!levels) { levels = new Map(); bars.set(barStart, levels); }
    const row = levels.get(price) ?? { buy: 0, sell: 0, lastIndex: index };
    if (trade.side === "buy") row.buy += trade.quantity;
    else row.sell += trade.quantity;
    row.lastIndex = index;
    levels.set(price, row);
  });

  const candidates: AbsorptionCandidate[] = [];
  for (const [barStart, levels] of bars) {
    const totalAtPrices = [...levels.values()].map(row => row.buy + row.sell);
    const averageAtPrice = totalAtPrices.reduce((sum, value) => sum + value, 0) / Math.max(1, totalAtPrices.length);
    for (const [price, row] of levels) {
      const aggressiveSell = row.sell >= minVolume && row.sell >= Math.max(row.buy, averageAtPrice) * dominance;
      const aggressiveBuy = row.buy >= minVolume && row.buy >= Math.max(row.sell, averageAtPrice) * dominance;
      if (!aggressiveSell && !aggressiveBuy) continue;
      const future = trades.slice(row.lastIndex + 1, row.lastIndex + 1 + lookahead);
      if (!future.length) continue;
      const extreme = aggressiveSell
        ? Math.min(...future.map(trade => trade.price))
        : Math.max(...future.map(trade => trade.price));
      const progressTicks = aggressiveSell
        ? Math.max(0, (price - extreme) / tickSize)
        : Math.max(0, (extreme - price) / tickSize);
      if (progressTicks > maxProgress) continue;
      const type = aggressiveSell ? "buy-absorption" : "sell-absorption";
      const aggressorVolume = aggressiveSell ? row.sell : row.buy;
      const opposingVolume = aggressiveSell ? row.buy : row.sell;
      const strength: AbsorptionCandidate["strength"] = aggressorVolume >= averageAtPrice * 3 ? "high" : aggressorVolume >= averageAtPrice * 2 ? "moderate" : "low";
      candidates.push({
        timestamp: trades[row.lastIndex].timestamp,
        price,
        type,
        aggressorSide: aggressiveSell ? "sell" : "buy",
        aggressorVolume,
        opposingVolume,
        delta: row.buy - row.sell,
        followThroughTicks: Number(progressTicks.toFixed(2)),
        strength,
        evidence: `${aggressiveSell ? "Aggressive selling" : "Aggressive buying"} was elevated at this price, but the next ${future.length} trades moved only ${progressTicks.toFixed(2)} ticks in the aggressor's direction.`,
      });
    }
  }
  return candidates.sort((a, b) => a.timestamp - b.timestamp || b.aggressorVolume - a.aggressorVolume);
}
