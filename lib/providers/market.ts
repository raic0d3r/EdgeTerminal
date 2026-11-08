export type MarketCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type MarketQuote = {
  symbol: "XAU/USD" | "XAG/USD";
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency: "USD";
  source: string;
  mode: "demo" | "live";
  updatedAt: string | null;
  candles?: MarketCandle[];
  dataNote?: string;
};

const SYMBOLS = new Set(["XAU/USD", "XAG/USD"]);

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
  }

  return response.json();
}

function normalizeCandles(json: any): MarketCandle[] {
  const values = Array.isArray(json)
    ? json
    : Array.isArray(json?.bars)
      ? json.bars
      : Array.isArray(json?.candles)
        ? json.candles
        : Array.isArray(json?.values)
          ? json.values
          : [];

  return values
    .map((v: any) => ({
      time: String(v.time ?? v.timestamp ?? v.datetime ?? v.openTime ?? ""),
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: numberOrNull(v.tickVolume) ?? numberOrNull(v.volume),
    }))
    .filter(
      (v: MarketCandle) =>
        v.time &&
        [v.open, v.high, v.low, v.close].every(Number.isFinite),
    )
    .sort(
      (a: MarketCandle, b: MarketCandle) =>
        Date.parse(a.time) - Date.parse(b.time),
    );
}

async function getBiquote(
  symbol: MarketQuote["symbol"],
  interval: string,
): Promise<MarketQuote> {
  const ticker = symbol === "XAU/USD" ? "XAUUSD" : "XAGUSD";

  const quote = await fetchJson(
    `https://biquote.io/api/${ticker}?allowStale=true`,
  );

  const price =
    numberOrNull(quote.mid) ??
    numberOrNull(quote.bid) ??
    numberOrNull(quote.ask);

  if (price === null) {
    throw new Error("BiQuote did not return a recognized price field");
  }

  let candles: MarketCandle[] = [];

  try {
    const intervalMap: Record<string, string> = {
      "1min": "1m",
      "5min": "5m",
      "15min": "15m",
      "30min": "30m",
      "1h": "1h",
      "4h": "4h",
      "1day": "1d",
    };

    const candleJson = await fetchJson(
      `https://biquote.io/api/${ticker}/ohlc?interval=${encodeURIComponent(
        intervalMap[interval] ?? "5m",
      )}&limit=120`,
    );

    candles = normalizeCandles(candleJson);
  } catch {
    // Keep the current quote if historical candles are unavailable.
  }

  const previous =
    candles.length > 1 ? candles[candles.length - 2] : undefined;

  return {
    symbol,
    price,
    change: previous ? price - previous.close : null,
    changePercent:
      previous?.close && previous.close !== 0
        ? ((price - previous.close) / previous.close) * 100
        : null,
    currency: "USD",
    source: "BiQuote",
    mode: "live",
    updatedAt: new Date().toISOString(),
    candles,
    dataNote:
      "Broker-specific spot/CFD data. Candle volume may be tick volume, not centralized traded volume.",
  };
}

async function getXaus(
  symbol: MarketQuote["symbol"],
): Promise<MarketQuote> {
  const data = await fetchJson(
    "https://xaus.com/api/v1/spot?compact=1",
  );

  const price = numberOrNull(
    symbol === "XAU/USD" ? data.spot_usd_oz : data.silver_usd_oz,
  );

  if (price === null) {
    throw new Error("XAUS response did not contain the expected spot price");
  }

  return {
    symbol,
    price,
    change: null,
    changePercent: null,
    currency: "USD",
    source: "XAUS spot",
    mode: "live",
    updatedAt: String(
      data.price_as_of ?? data.updated_at ?? new Date().toISOString(),
    ),
    candles: [],
    dataNote:
      "XAUS spot-price fallback. Intraday candles and traded volume are not supplied by this endpoint.",
  };
}

export async function getMarketQuote(
  symbolInput: string,
  interval = "5min",
): Promise<MarketQuote> {
  const symbol = symbolInput.toUpperCase();

  if (!SYMBOLS.has(symbol)) {
    throw new Error("Unsupported instrument");
  }

  const asset = symbol as MarketQuote["symbol"];
  const mode =
    process.env.MARKET_DATA_MODE === "live" ? "live" : "demo";

  if (mode === "demo") {
    return {
      symbol: asset,
      price: null,
      change: null,
      changePercent: null,
      currency: "USD",
      source: "not-configured",
      mode: "demo",
      updatedAt: null,
      dataNote: "Set MARKET_DATA_MODE=live to enable market data.",
    };
  }

  const provider = (
    process.env.MARKET_DATA_PROVIDER ?? "biquote-xaus"
  ).toLowerCase();

  if (provider === "biquote") {
    return getBiquote(asset, interval);
  }

  if (provider === "xaus") {
    return getXaus(asset);
  }

  if (provider === "biquote-xaus") {
    try {
      return await getBiquote(asset, interval);
    } catch (biquoteError) {
      try {
        return await getXaus(asset);
      } catch (xausError) {
        const first =
          biquoteError instanceof Error
            ? biquoteError.message
            : "BiQuote request failed";

        const second =
          xausError instanceof Error
            ? xausError.message
            : "XAUS request failed";

        throw new Error(
          `Both free providers failed. BiQuote: ${first}. XAUS: ${second}`,
        );
      }
    }
  }

  throw new Error(
    `Unsupported market provider "${provider}". Use biquote-xaus, biquote, or xaus.`,
  );
}