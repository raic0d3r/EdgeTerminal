import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CotRow = Record<string, string | number | undefined>;
type Observation = { date: string; value: string };

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function biasFromDelta(value: number | null, threshold = 0): "Bullish" | "Bearish" | "Neutral" {
  if (value == null || Math.abs(value) <= threshold) return "Neutral";
  return value > 0 ? "Bullish" : "Bearish";
}

type SentmoPayload = {
  instrument?: string;
  current_data?: { timestamp?: string; long?: number; short?: number };
  data_24h_ago?: { timestamp?: string; long?: number; short?: number };
  long_change?: number;
  short_change?: number;
  as_of?: string;
  source?: string;
};

async function getSentmoGold() {
  const endpoint = "https://sentmo-worker.business-41d.workers.dev/api/data/gold";
  const response = await fetch(endpoint, {
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Sentmo returned HTTP ${response.status}`);
  const body = await response.json() as SentmoPayload;
  const current = body.current_data;
  const previous = body.data_24h_ago;
  const long = num(current?.long);
  const short = num(current?.short);
  const timestamp = current?.timestamp || body.as_of || "";
  if (body.instrument !== "GOLD" || long == null || short == null ||
      long < 0 || long > 100 || short < 0 || short > 100 ||
      Math.abs(long + short - 100) > 1 || !timestamp || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error("Sentmo returned an invalid or incomplete Gold positioning payload.");
  }
  // Directional sentiment describes what surveyed retail clients are positioned for.
  // Contrarian interpretation is kept separate and must never overwrite that label.
  const bias: "Bullish" | "Bearish" | "Neutral" = long > short ? "Bullish" : short > long ? "Bearish" : "Neutral";
  const contrarianBias: "Bullish" | "Bearish" | "Neutral" = long >= 70 ? "Bearish" : short >= 70 ? "Bullish" : "Neutral";
  const previousLong = num(previous?.long);
  const previousShort = num(previous?.short);
  return {
    status: "connected",
    bias,
    contrarianBias,
    provider: "Sentmo",
    source: endpoint,
    instrument: "GOLD",
    longPositionPercentage: long,
    shortPositionPercentage: short,
    previousLongPositionPercentage: previousLong,
    previousShortPositionPercentage: previousShort,
    longChangeReported: num(body.long_change),
    shortChangeReported: num(body.short_change),
    currentTimestamp: timestamp,
    previousTimestamp: previous?.timestamp || null,
    freshness: "Provider dashboard checks every 15 minutes; underlying positioning is daily",
    detail: "Directional sentiment follows the larger reported position. Contrarian crowding heuristic is shown separately: ≥70% long may imply bearish contrarian risk; ≥70% short may imply bullish contrarian risk. Neither is a standalone forecast.",
  };
}

async function getCot(asset: "XAU/USD" | "XAG/USD") {
  const code = asset === "XAU/USD" ? "088691" : "084691";
  const fields = ["report_date_as_yyyy_mm_dd", "market_and_exchange_names", "open_interest_all", "m_money_positions_long_all", "m_money_positions_short_all"];
  const params = new URLSearchParams({
    "$select": fields.join(","),
    "$where": `cftc_contract_market_code='${code}'`,
    "$order": "report_date_as_yyyy_mm_dd DESC",
    "$limit": "60",
  });
  const response = await fetch(`https://publicreporting.cftc.gov/resource/72hh-3qpy.json?${params}`, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`CFTC returned ${response.status}`);
  const rows = await response.json() as CotRow[];
  const usable = rows.map(row => ({
    date: String(row.report_date_as_yyyy_mm_dd || "").slice(0, 10),
    long: num(row.m_money_positions_long_all),
    short: num(row.m_money_positions_short_all),
    oi: num(row.open_interest_all),
  })).filter(row => row.date && row.long != null && row.short != null);
  if (!usable.length) throw new Error("No matching CFTC managed-money records were returned.");
  const latest = usable[0];
  const previous = usable[1];
  const net = latest.long! - latest.short!;
  const previousNet = previous ? previous.long! - previous.short! : null;
  const weeklyChange = previousNet == null ? null : net - previousNet;
  const recent = usable.slice(0, 52).map(row => row.long! - row.short!);
  const percentile = recent.length > 1 ? Math.round((recent.filter(value => value <= net).length / recent.length) * 100) : null;
  return {
    status: "connected", bias: biasFromDelta(weeklyChange, 0), netContracts: net, weeklyChange,
    percentile52w: percentile, openInterest: latest.oi, reportDate: latest.date,
    market: String(rows[0]?.market_and_exchange_names || "COMEX"),
    source: "CFTC Disaggregated Futures Only · Managed Money", freshness: "Weekly",
  };
}

async function getFundamentals() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return {
    status: "not_configured",
    bias: "Neutral" as const,
    source: "Federal Reserve Bank of St. Louis · FRED",
    detail: "Add FRED_API_KEY to the server environment to enable macro inputs.",
  };

  const series = ["DGS10", "DTWEXBGS", "FEDFUNDS", "CPIAUCSL"];
  const observations = await Promise.all(series.map(async id => {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.search = new URLSearchParams({
      series_id: id,
      api_key: apiKey,
      file_type: "json",
      sort_order: "desc",
      limit: "10",
    }).toString();
    const response = await fetch(url, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`FRED ${id} returned HTTP ${response.status}`);
    const body = await response.json() as { observations?: Observation[]; error_code?: number; error_message?: string };
    if (body.error_code) throw new Error(`FRED ${id}: ${body.error_message || "API error"}`);
    const values = (body.observations || [])
      .filter(item => item.value !== ".")
      .map(item => ({ date: item.date, value: Number(item.value) }))
      .filter(item => Number.isFinite(item.value) && !!item.date);
    return { id, values };
  }));

  const valuesFor = (id: string) => observations.find(item => item.id === id)?.values || [];
  const latestFor = (id: string) => valuesFor(id)[0] || null;
  // Compare the latest observation with the fifth available observation. This avoids
  // treating missing market holidays as zero and gives a short, auditable trend window.
  const snapshot = (id: string) => {
    const values = valuesFor(id);
    const latest = values[0] || null;
    const comparison = values[Math.min(4, values.length - 1)] || null;
    return latest ? {
      value: latest.value,
      date: latest.date,
      previousValue: comparison && comparison !== latest ? comparison.value : null,
      comparisonDate: comparison && comparison !== latest ? comparison.date : null,
      change: comparison && comparison !== latest ? Number((latest.value - comparison.value).toFixed(4)) : null,
    } : null;
  };

  const tenYearYield = snapshot("DGS10");
  const broadDollarIndex = snapshot("DTWEXBGS");
  const fedFundsRate = latestFor("FEDFUNDS");
  const cpi = latestFor("CPIAUCSL");

  // Gold tends to benefit when Treasury yields and the broad USD index fall.
  // These two directional proxies are equally weighted; policy rate and CPI are
  // displayed as macro context and are not standalone directional votes.
  const components = [
    tenYearYield?.change == null ? null : -Math.sign(tenYearYield.change),
    broadDollarIndex?.change == null ? null : -Math.sign(broadDollarIndex.change),
  ].filter((value): value is number => value != null);
  const score = components.length ? components.reduce((sum, value) => sum + value, 0) / components.length : null;
  const bias: "Bullish" | "Bearish" | "Neutral" = score == null || Math.abs(score) < 0.25
    ? "Neutral"
    : score > 0 ? "Bullish" : "Bearish";

  return {
    status: components.length ? "connected" : "unavailable",
    bias,
    score: score == null ? null : Math.round(score * 100),
    inputs: {
      tenYearYield,
      broadDollarIndex,
      fedFundsRate: fedFundsRate ? { value: fedFundsRate.value, date: fedFundsRate.date } : null,
      cpi: cpi ? { value: cpi.value, date: cpi.date } : null,
    },
    source: "FRED · DGS10, DTWEXBGS, FEDFUNDS, CPIAUCSL",
    freshness: "Yield and broad USD: daily business-day observations; Fed funds and CPI: monthly",
    detail: "Macro bias is an equal-weight directional proxy from recent 10-year Treasury yield and broad USD changes. Federal Funds Rate and CPI are context only, not standalone buy/sell signals.",
  };
}

export async function GET(request: NextRequest) {
  const asset = (request.nextUrl.searchParams.get("asset") || "XAU/USD").toUpperCase();
  if (asset !== "XAU/USD" && asset !== "XAG/USD" && asset !== "BTC/USD") return NextResponse.json({ error: "Supported assets are XAU/USD, XAG/USD and BTC/USD." }, { status: 400 });
  const [cotResult, fundamentalsResult, sentmoResult] = await Promise.allSettled([
    (asset === "XAU/USD" || asset === "XAG/USD") ? getCot(asset) : Promise.resolve(null), getFundamentals(), asset === "XAU/USD" ? getSentmoGold() : Promise.resolve(null),
  ]);
  const cot = asset === "BTC/USD" ? { status: "unavailable", bias: "Neutral", detail: "COT futures positioning is not mapped to this BTC/USD spot/CFD instrument." } : cotResult.status === "fulfilled" ? cotResult.value : { status: "unavailable", bias: "Neutral", detail: cotResult.reason instanceof Error ? cotResult.reason.message : "CFTC data unavailable." };
  const fundamentals = fundamentalsResult.status === "fulfilled" ? fundamentalsResult.value : { status: "unavailable", bias: "Neutral", detail: fundamentalsResult.reason instanceof Error ? fundamentalsResult.reason.message : "FRED data unavailable." };
  const retailSentiment = asset === "XAU/USD"
    ? sentmoResult.status === "fulfilled" && sentmoResult.value
      ? sentmoResult.value
      : { status: "unavailable", bias: "Neutral" as const, provider: "Sentmo", source: "Sentmo public Gold positioning API", detail: sentmoResult.status === "rejected" ? (sentmoResult.reason instanceof Error ? sentmoResult.reason.message : "Sentmo data unavailable.") : "Sentmo data unavailable." }
    : asset === "XAG/USD"
      ? { status: "external_only", bias: "Neutral" as const, provider: "TradeLytics", source: "TradeLytics public XAGUSD composite sentiment dashboard", detail: "TradeLytics composite sentiment is not a verified retail long/short ratio. No public import endpoint is configured; values are not included in Master Bias." }
      : { status: "unavailable", bias: "Neutral" as const, provider: "Not configured", source: "BTC/USD retail positioning", detail: "No verified BTC/USD retail long/short positioning feed is configured." };
  return NextResponse.json({ asset, updatedAt: new Date().toISOString(), cot, retailSentiment, fundamentals }, { headers: { "Cache-Control": "no-store" } });
}
