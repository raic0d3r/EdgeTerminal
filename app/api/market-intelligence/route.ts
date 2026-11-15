import { NextRequest, NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/server/require-feature-access";
import { enforceIpRateLimit, enforceRateLimit } from "@/lib/server/rate-limit";
import { buildMarketForecast } from "@/lib/market-intelligence/engine";
import type { MarketCandle } from "@/lib/providers/market";
import { analyzeLiquidity } from "@/lib/market-intelligence/liquidity-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOLS: Record<string, "XAU/USD" | "XAG/USD" | "BTC/USD"> = {
  XAUUSD: "XAU/USD", "XAU/USD": "XAU/USD",
  XAGUSD: "XAG/USD", "XAG/USD": "XAG/USD",
  BTCUSD: "BTC/USD", "BTC/USD": "BTC/USD",
};
const INTERVALS = new Set(["1min", "5min", "10min", "15min", "30min", "1h", "4h", "1day", "1week", "1month"]);

function aggregateCandles(candles: MarketCandle[], interval: "10min" | "1week" | "1month"): MarketCandle[] {
  const buckets = new Map<number, MarketCandle[]>();
  for (const candle of candles) {
    const time = Date.parse(candle.time);
    if (!Number.isFinite(time)) continue;
    const date = new Date(time);
    let bucket: number;
    if (interval === "10min") bucket = Math.floor(time / 600_000);
    else if (interval === "1week") {
      const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const mondayOffset = (day.getUTCDay() + 6) % 7;
      day.setUTCDate(day.getUTCDate() - mondayOffset);
      bucket = day.getTime();
    } else bucket = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    buckets.set(bucket, [...(buckets.get(bucket) || []), candle]);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([bucket, rows]) => ({
    time: new Date(bucket * (interval === "10min" ? 600_000 : 1)).toISOString(),
    open: rows[0].open,
    high: Math.max(...rows.map(row => row.high)),
    low: Math.min(...rows.map(row => row.low)),
    close: rows[rows.length - 1].close,
    volume: rows.reduce((sum, row) => sum + (row.volume || 0), 0),
  }));
}

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "market-intelligence", 20, 60);
  if (limited) return limited;

  const access = await requireFeatureAccess(request, "Market Intelligence");
  if (!access.allowed) return access.response;
  const userLimited = await enforceRateLimit({ key: `uid:${access.uid}:market-intelligence`, limit: 20, windowSeconds: 60 });
  if (userLimited) return userLimited;

  const params = request.nextUrl.searchParams;
  const rawSymbol = (params.get("symbol") || "XAU/USD").toUpperCase();
  const symbol = SYMBOLS[rawSymbol];
  const broker = (params.get("provider") || "ctrader").toLowerCase();
  const timeframe = params.get("interval") || "15min";
  if (!symbol) return NextResponse.json({ status: "error", error: "Supported symbols are XAU/USD, XAG/USD and BTC/USD (subject to broker availability)." }, { status: 400 });
  if (broker !== "ctrader" && broker !== "exness") return NextResponse.json({ status: "error", error: "Choose cTrader or Exness." }, { status: 400 });
  if (!INTERVALS.has(timeframe)) return NextResponse.json({ status: "error", error: "Unsupported candle interval." }, { status: 400 });

  try {
    // Reuse the authenticated broker market-data route. Forward the user's
    // existing Firebase bearer token and cTrader session cookie unchanged.
    const headers = new Headers();
    const authorization = request.headers.get("authorization");
    const cookie = request.headers.get("cookie");
    if (authorization) headers.set("authorization", authorization);
    if (cookie) headers.set("cookie", cookie);

    const loadCandles = async (interval: string, marketSymbol: "XAU/USD" | "XAG/USD" | "BTC/USD" = symbol, historyBars = 500) => {
      const sourceInterval = interval === "10min" ? "5min" : interval === "1week" || interval === "1month" ? "1day" : interval;
      const marketUrl = new URL("/api/market", request.url);
      marketUrl.searchParams.set("symbol", marketSymbol);
      marketUrl.searchParams.set("interval", sourceInterval);
      marketUrl.searchParams.set("provider", broker);
      marketUrl.searchParams.set("historyBars", String(historyBars));
      const response = await fetch(marketUrl, { headers, cache: "no-store", signal: AbortSignal.timeout(45_000) });
      const body = await response.json();
      if (!response.ok || !body?.data || !Array.isArray(body.data.candles)) {
        throw new Error(body?.error || `The broker did not return ${interval} historical candles.`);
      }
      let candles: MarketCandle[] = body.data.candles.map((c: Record<string, unknown>) => ({
        time: String(c.time || ""),
        open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
        volume: c.volume == null ? null : Number(c.volume),
      }));
      if (interval === "10min" || interval === "1week" || interval === "1month") candles = aggregateCandles(candles, interval);
      return { candles, body };
    };

    const higherTimeframeByInterval: Record<string, string | null> = {
      "1min": "15min", "5min": "15min", "10min": "1h", "15min": "4h",
      "30min": "4h", "1h": "4h", "4h": "1day", "1day": "1week", "1week": "1month", "1month": null,
    };
    const higherTimeframe = higherTimeframeByInterval[timeframe];
    const intervals = ["5min", "15min", "1h", "4h", "1day", "1week", "1month"];
    const comparisonSymbol = symbol === "XAU/USD" ? "XAG/USD" : "XAU/USD";
    const [primary, comparisonResult, ...mtfResults] = await Promise.all([
      loadCandles(timeframe, symbol, 2500),
      loadCandles(timeframe, comparisonSymbol, 500).catch(() => null),
      ...intervals.map((tf) => tf === timeframe ? Promise.resolve(null) : loadCandles(tf).catch(() => null)),
    ]);
    const multiTimeframeCandles: Record<string, MarketCandle[]> = {};
    intervals.forEach((tf, index) => {
      const result = tf === timeframe ? primary : mtfResults[index];
      if (result?.candles) multiTimeframeCandles[tf] = result.candles;
    });
    let higherTimeframeCandles: MarketCandle[] = [];
    if (higherTimeframe) higherTimeframeCandles = multiTimeframeCandles[higherTimeframe] || [];


    const payload = primary.body;
    const forecast = buildMarketForecast({
      candles: primary.candles, symbol, broker, timeframe,
      source: String(payload.data.source || broker),
      mode: String(payload.data.mode || payload.status || "unknown"),
      dataNote: String(payload.data.dataNote || payload.disclaimer || ""),
      historyOldestCandle: payload.data.history?.oldestCandle || primary.candles[0]?.time || null,
      historyRequestedBars: Number(payload.data.history?.requestedBars || primary.candles.length),
      higherTimeframeCandles, higherTimeframe, multiTimeframeCandles,
      comparisonCandles: comparisonResult?.candles || [],
    });
    return NextResponse.json({ status: "ok", forecast, validationPrices: primary.candles.map(candle => ({ time: candle.time, close: candle.close })), liquidityMap: analyzeLiquidity(primary.candles) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Market Intelligence analysis failed.";
    return NextResponse.json({ status: "unavailable", provider: broker, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
