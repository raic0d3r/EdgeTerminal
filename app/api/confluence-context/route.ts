import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SeriesPoint = { time: string; close: number };

async function loadDaily(ticker: string): Promise<SeriesPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1mo&interval=1d`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 EdgeTerminal/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`${ticker} provider returned HTTP ${response.status}`);
  const body = await response.json();
  const result = body?.chart?.result?.[0];
  if (!result) throw new Error(body?.chart?.error?.description || `No daily history for ${ticker}`);
  const times: number[] = result.timestamp || [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
  return times.map((time, i) => ({ time: new Date(time * 1000).toISOString(), close: closes[i] as number }))
    .filter((point) => Number.isFinite(point.close) && point.close > 0);
}

function changePct(points: SeriesPoint[]) {
  if (points.length < 2) return null;
  const previous = points[points.length - 2].close;
  return previous ? ((points[points.length - 1].close / previous) - 1) * 100 : null;
}

function pearson(x: number[], y: number[]) {
  if (x.length < 10 || x.length !== y.length) return null;
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; cov += dx * dy; vx += dx * dx; vy += dy * dy; }
  return vx && vy ? Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy))) : null;
}

export async function GET() {
  const settled = await Promise.allSettled([loadDaily("DX-Y.NYB"), loadDaily("^TNX")]);
  const dxy = settled[0].status === "fulfilled" ? settled[0].value : [];
  const us10y = settled[1].status === "fulfilled" ? settled[1].value : [];
  const aligned = dxy.map(p => ({ date: p.time.slice(0, 10), close: p.close }))
    .filter(p => us10y.some(q => q.time.slice(0, 10) === p.date))
    .map(p => ({ date: p.date, dxy: p.close, us10y: us10y.find(q => q.time.slice(0, 10) === p.date)!.close }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const dxyReturns = aligned.slice(1).map((p, i) => p.dxy / aligned[i].dxy - 1);
  const yieldReturns = aligned.slice(1).map((p, i) => p.us10y - aligned[i].us10y);
  return NextResponse.json({
    status: dxy.length || us10y.length ? "partial" : "unavailable",
    source: "Yahoo Finance chart endpoint (unofficial; daily observations)",
    updatedAt: new Date().toISOString(),
    dxy: dxy.length ? { value: dxy[dxy.length - 1].close, changePct: changePct(dxy), asOf: dxy[dxy.length - 1].time } : null,
    us10y: us10y.length ? { value: us10y[us10y.length - 1].close, change: us10y.length > 1 ? us10y[us10y.length - 1].close - us10y[us10y.length - 2].close : null, asOf: us10y[us10y.length - 1].time } : null,
    dxyYieldCorrelation: pearson(dxyReturns, yieldReturns),
    errors: [settled[0].status === "rejected" ? "DXY daily history unavailable" : null, settled[1].status === "rejected" ? "US 10-year yield history unavailable" : null].filter(Boolean),
    note: "Daily macro proxies, not streaming quotes. DXY and US10Y are context inputs, not a calibrated forecast.",
  }, { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } });
}
