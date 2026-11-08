import { NextResponse } from "next/server";

export const revalidate = 900;
export const dynamic = "force-dynamic";

const SYMBOLS = [
  { key: "XAU", ticker: "XAU/USD spot (XAUS)" }, // Gold spot, not futures
  { key: "XAG", ticker: "SI=F" },       // Silver futures proxy
  { key: "DXY", ticker: "DX-Y.NYB" },   // US Dollar Index
  { key: "US10Y", ticker: "^TNX" },     // 10-year Treasury yield index
  { key: "SPY", ticker: "SPY" },        // S&P 500 ETF
];

const PERIODS: Record<string, { range: string; days: number }> = {
  "30D": { range: "3mo", days: 30 },
  "90D": { range: "6mo", days: 90 },
  "180D": { range: "1y", days: 180 },
  "1Y": { range: "2y", days: 252 },
};

async function fetchXausGold() {
  const response = await fetch("https://xaus.com/api/v1/history", {
    headers: { "Accept": "application/json", "User-Agent": "EdgeTerminal/1.0" },
    next: { revalidate: 21600 },
  });
  if (!response.ok) throw new Error(`XAUS gold spot history returned ${response.status}`);
  const body = await response.json();
  const rows = Array.isArray(body?.points) ? body.points : [];
  const points: Record<string, number> = {};
  for (const row of rows) {
    const date = typeof row?.d === "string" ? row.d : null;
    const close = typeof row?.c === "number" ? row.c : null;
    if (date && close !== null && Number.isFinite(close) && close > 0) points[date] = close;
  }
  if (Object.keys(points).length < 11) throw new Error("XAUS returned too few daily XAU/USD spot history points");
  return points;
}

async function fetchSeries(ticker: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&events=history`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 EdgeTerminal/1.0", "Accept": "application/json" },
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`Market data provider returned ${response.status} for ${ticker}`);
  const body = await response.json();
  const result = body?.chart?.result?.[0];
  if (!result) throw new Error(body?.chart?.error?.description || `No historical data for ${ticker}`);
  const timestamps: number[] = result.timestamp || [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
  const points: Record<string, number> = {};
  timestamps.forEach((ts, i) => {
    const close = closes[i];
    if (typeof close === "number" && Number.isFinite(close) && close > 0) {
      points[new Date(ts * 1000).toISOString().slice(0, 10)] = close;
    }
  });
  return points;
}

function correlation(x: number[], y: number[]) {
  if (x.length < 10 || y.length !== x.length) return null;
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let covariance = 0, vx = 0, vy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    covariance += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return Math.max(-1, Math.min(1, covariance / Math.sqrt(vx * vy)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "90D";
  const config = PERIODS[period] || PERIODS["90D"];
  try {
    const series = await Promise.all(SYMBOLS.map(async asset => ({
      key: asset.key,
      ticker: asset.ticker,
      prices: asset.key === "XAU" ? await fetchXausGold() : await fetchSeries(asset.ticker, config.range),
    })));
    const commonDates = series.map(s => Object.keys(s.prices)).reduce((a, b) => a.filter(date => b.includes(date))).sort();
    const dates = commonDates.slice(-(config.days + 1));
    if (dates.length < 11) throw new Error(`Only ${dates.length} aligned daily observations are available; at least 11 are required.`);
    const returns = series.map(s => dates.slice(1).map((date, i) => (s.prices[date] / s.prices[dates[i]]) - 1));
    const matrix = SYMBOLS.map((_, i) => SYMBOLS.map((__, j) => i === j ? 1 : correlation(returns[i], returns[j])));
    return NextResponse.json({
      status: "ok", period, observations: dates.length - 1,
      from: dates[0], to: dates[dates.length - 1], updatedAt: new Date().toISOString(),
      source: "XAUS XAU/USD spot history + Yahoo Finance daily series for other instruments (Yahoo endpoint unofficial)",
      assets: SYMBOLS.map(({key,ticker}) => ({ key, ticker })),
      matrix,
      notes: { XAU: "XAU/USD spot from XAUS daily history", XAG: "SI=F silver futures proxy, not spot silver", DXY: "DX-Y.NYB US Dollar Index", US10Y: "^TNX 10-year Treasury yield index; this series is a yield level, not a traded asset price", SPY: "SPY ETF" },
    }, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retrieve market history.";
    return NextResponse.json({ status: "error", error: message }, { status: 502 });
  }
}
