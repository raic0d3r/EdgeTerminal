import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Observation = { date: string; value: string };
type Point = { value: number; date: string };

function validObservations(items: Observation[] = []): Point[] {
  return items
    .filter((item) => item.value !== "." && item.value !== "")
    .map((item) => ({ value: Number(item.value), date: item.date }))
    .filter((item) => Number.isFinite(item.value) && !!item.date);
}

async function getSeries(seriesId: string, limit = 16): Promise<Point[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY is not configured on the server.");
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.search = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: String(limit),
  }).toString();

  const response = await fetch(url, {
    next: { revalidate: 21600 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`FRED ${seriesId} returned HTTP ${response.status}.`);
  const body = await response.json() as {
    observations?: Observation[];
    error_code?: number;
    error_message?: string;
  };
  if (body.error_code) throw new Error(`FRED ${seriesId}: ${body.error_message || "API error"}`);
  return validObservations(body.observations);
}

function latest(points: Point[]) { return points[0] || null; }
function changeFrom(points: Point[], index: number) {
  if (points.length <= index) return null;
  return Number((points[0].value - points[index].value).toFixed(4));
}
function yoy(points: Point[]) {
  if (points.length < 13) return null;
  const prior = points[12];
  if (!prior || prior.value === 0) return null;
  return Number((((points[0].value / prior.value) - 1) * 100).toFixed(2));
}

export async function GET() {
  try {
    const ids = ["FEDFUNDS", "CPIAUCSL", "PCEPI", "UNRATE", "DGS2", "DGS10"];
    const results = await Promise.allSettled(ids.map((id) => getSeries(id, 16)));
    const data: Record<string, Point[]> = {};
    const errors: Record<string, string> = {};
    ids.forEach((id, index) => {
      const result = results[index];
      if (result.status === "fulfilled") data[id] = result.value;
      else errors[id] = result.reason instanceof Error ? result.reason.message : "FRED data unavailable.";
    });

    const fedFunds = latest(data.FEDFUNDS || []);
    const cpi = yoy(data.CPIAUCSL || []);
    const pce = yoy(data.PCEPI || []);
    const cpiPrior = (data.CPIAUCSL?.length ?? 0) >= 16
      ? Number((((data.CPIAUCSL[3].value / data.CPIAUCSL[15].value) - 1) * 100).toFixed(2))
      : null;
    const pcePrior = (data.PCEPI?.length ?? 0) >= 16
      ? Number((((data.PCEPI[3].value / data.PCEPI[15].value) - 1) * 100).toFixed(2))
      : null;
    const unemployment = latest(data.UNRATE || []);
    const unemploymentChange3m = changeFrom(data.UNRATE || [], 3);
    const twoYear = latest(data.DGS2 || []);
    const twoYearChange5d = changeFrom(data.DGS2 || [], 4);
    const tenYear = latest(data.DGS10 || []);
    const tenYearChange5d = changeFrom(data.DGS10 || [], 4);

    // Transparent qualitative heuristic only; it is NOT a market-implied probability.
    const pressureInputs: Array<number | null> = [
      cpi != null && cpiPrior != null ? Math.sign(cpi - cpiPrior) : null,
      pce != null && pcePrior != null ? Math.sign(pce - pcePrior) : null,
      unemploymentChange3m == null ? null : -Math.sign(unemploymentChange3m),
      twoYearChange5d == null ? null : Math.sign(twoYearChange5d),
    ];
    const usable = pressureInputs.filter((value): value is number => value != null);
    const pressureScore = usable.length
      ? Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 100)
      : null;
    const pressureLabel = pressureScore == null
      ? "Insufficient data"
      : pressureScore >= 35 ? "Hawkish pressure"
      : pressureScore <= -35 ? "Dovish pressure"
      : "Mixed / neutral";

    const now = new Date();
    const nextMeeting = now < new Date("2026-12-08T00:00:00Z")
      ? { start: "2026-12-08", end: "2026-12-09", label: "December 8–9, 2026" }
      : null;

    return NextResponse.json({
      status: usable.length >= 2 ? "connected" : "partial",
      updatedAt: new Date().toISOString(),
      nextMeeting,
      policyRate: fedFunds ? { ...fedFunds, label: "Effective Federal Funds Rate" } : null,
      inflation: {
        cpiYoY: cpi == null ? null : { value: cpi, date: data.CPIAUCSL?.[0]?.date || null, priorValue: cpiPrior },
        pceYoY: pce == null ? null : { value: pce, date: data.PCEPI?.[0]?.date || null, priorValue: pcePrior },
      },
      employment: {
        unemployment: unemployment ? { ...unemployment, change3m: unemploymentChange3m } : null,
      },
      yields: {
        twoYear: twoYear ? { ...twoYear, change5d: twoYearChange5d } : null,
        tenYear: tenYear ? { ...tenYear, change5d: tenYearChange5d } : null,
      },
      pressure: { score: pressureScore, label: pressureLabel, inputsAvailable: usable.length, inputsTotal: 4 },
      marketImplied: {
        status: "external",
        provider: "CME FedWatch",
        message: "Live meeting probabilities require CME FedWatch data access. No probability is estimated or fabricated here.",
        url: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html",
      },
      errors,
      sources: {
        fred: "https://fred.stlouisfed.org/",
        fomc: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
        fedwatch: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html",
      },
      disclaimer: "Economic indicators describe policy pressure, not a forecast or confirmed Fed decision. Only an official FOMC statement confirms a rate decision.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      status: "unavailable",
      error: error instanceof Error ? error.message : "Federal Reserve data unavailable.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
