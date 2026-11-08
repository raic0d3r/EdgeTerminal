import WebSocket from "ws";
import { exnessGet, signedHeaders, verifyExnessConnection, type ExnessCredentials } from "./client";

const TIMEFRAMES: Record<string, { api: string; seconds: number }> = {
  "1min": { api: "M1", seconds: 60 },
  "5min": { api: "M5", seconds: 300 },
  "15min": { api: "M15", seconds: 900 },
  "30min": { api: "M30", seconds: 1800 },
  "1h": { api: "H1", seconds: 3600 },
  "4h": { api: "H4", seconds: 14400 },
  "1day": { api: "D1", seconds: 86400 },
};

// Short server-side caches reduce repeated REST work while keeping the live
// quote path responsive. Cache keys include account, instrument and timeframe.
type NormalizedExnessCandle = { time: string; open: number; high: number; low: number; close: number; volume: number; volumeType: "tick" };
const accessPointCache = new Map<string, { expiresAt: number; accessPoint: string }>();
const instrumentCache = new Map<string, { expiresAt: number; instrument: string }>();
const candleCache = new Map<string, { expiresAt: number; candles: NormalizedExnessCandle[] }>();

async function getResolvedAccessPoint(credentials: ExnessCredentials) {
  if (credentials.accessPoint) return credentials.accessPoint;
  const key = `${credentials.accountId}:${credentials.gatewayUrl}`;
  const cached = accessPointCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.accessPoint;
  const verified = await verifyExnessConnection(credentials);
  accessPointCache.set(key, { accessPoint: verified.accessPoint, expiresAt: Date.now() + 30 * 60_000 });
  return verified.accessPoint;
}

type CandleSide = { open: number; high: number; low: number; close: number };
type ExnessCandle = { time?: string; volume?: number; bid?: CandleSide; ask?: CandleSide; open?: number; high?: number; low?: number; close?: number };
type InstrumentResponse = { instruments?: string[] };
type CandleResponse = {
  candles?: ExnessCandle[];
  bidCandles?: { candles?: ExnessCandle[] };
  askCandles?: { candles?: ExnessCandle[] };
  bidAskCandles?: { candles?: ExnessCandle[] };
  data?: { candles?: ExnessCandle[] };
  code?: number;
  error_message?: string;
};

function mid(bid: number, ask: number) { return (bid + ask) / 2; }
function candleSide(v: any): CandleSide | null {
  if (!v || ![v.open, v.high, v.low, v.close].every((x: unknown) => Number.isFinite(Number(x)))) return null;
  return { open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close) };
}

export async function getExnessCandles(credentials: ExnessCredentials, symbol: string, interval: string, limit = 300) {
  const tf = TIMEFRAMES[interval];
  if (!tf) throw new Error(`Unsupported Exness timeframe: ${interval}`);
  const requestedInstrument = symbol === "XAU/USD" ? "XAUUSD" : symbol === "XAG/USD" ? "XAGUSD" : "";
  if (!requestedInstrument) throw new Error("Unsupported Exness instrument.");
  const accountKey = `${credentials.accountId}:${credentials.accessPoint || credentials.gatewayUrl || "gateway"}`;
  const candleKey = `${accountKey}:${requestedInstrument}:${interval}:${limit}`;
  const cachedCandles = candleCache.get(candleKey);
  if (cachedCandles && cachedCandles.expiresAt > Date.now()) return cachedCandles.candles;

  // The Exness Gateway URL is only the discovery endpoint. Market-data and
  // account-configuration requests must go to the account-specific Access Point.
  // User connections already persist accessPoint; admin .env test credentials
  // do not, so discover it here exactly as the working server.mjs does.
  const accessPoint = await getResolvedAccessPoint(credentials);
  const baseUrl = accessPoint;
  const instrumentKey = `${accountKey}:${requestedInstrument}`;
  let instrument = instrumentCache.get(instrumentKey)?.expiresAt! > Date.now()
    ? instrumentCache.get(instrumentKey)!.instrument : "";
  if (!instrument) {
    const instrumentResponse = await exnessGet<{ instruments?: string[] }>(
      credentials, baseUrl, `/v1/configuration/accounts/${credentials.accountId}/instruments`,
    );
    const available = Array.isArray(instrumentResponse.instruments) ? instrumentResponse.instruments : [];
    instrument = available.find((name) => name.toUpperCase() === requestedInstrument)
      || available.find((name) => name.toUpperCase().startsWith(requestedInstrument + "."))
      || available.find((name) => name.toUpperCase().startsWith(requestedInstrument + "_"))
      || available.find((name) => name.toUpperCase().startsWith(requestedInstrument + "-"))
      || "";
    if (!instrument) {
      const related = available.filter((name) => name.toUpperCase().includes(requestedInstrument.slice(0, 3))).slice(0, 20);
      throw new Error(`Exness account does not list ${requestedInstrument}. Related available instruments: ${related.join(", ") || "none"}.`);
    }
    instrumentCache.set(instrumentKey, { instrument, expiresAt: Date.now() + 10 * 60_000 });
  }

  // Use an explicit [from, to) window. Exness documents both `from+count`
  // and `from+to`; the explicit window avoids ambiguity around bidirectional count.
  const count = Math.min(Math.max(limit, 2), 500);
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - tf.seconds * count * 1000);
  const from = fromDate.toISOString();
  const to = toDate.toISOString();

  const parseRows = (rows: any[]) => rows.flatMap((c: ExnessCandle) => {
    const bid = candleSide(c.bid), ask = candleSide(c.ask);
    let o: CandleSide | null = null;
    if (bid && ask) o = { open: mid(bid.open, ask.open), high: mid(bid.high, ask.high), low: mid(bid.low, ask.low), close: mid(bid.close, ask.close) };
    else o = candleSide(c);
    if (!o || !c.time || !Number.isFinite(Date.parse(c.time))) return [];
    return [{ time: new Date(c.time).toISOString(), ...o, volume: Number(c.volume || 0), volumeType: "tick" as const }];
  });

  const attempts: Array<{ priceType: "both" | "bid" | "ask"; rows: any[]; fields: string }> = [];
  for (const priceType of ["both", "bid", "ask"] as const) {
    const query = new URLSearchParams([
      ["instrument", instrument],
      ["price_type", priceType],
      ["timeframe", tf.api],
      ["from", from],
      ["to", to],
    ]);
    const path = `/v1/market-data/accounts/${credentials.accountId}/candles?${query.toString()}`;
    const result = await exnessGet<any>(credentials, baseUrl, path);
    const rows = Array.isArray(result?.candles) ? result.candles
      : Array.isArray(result?.bidAskCandles?.candles) ? result.bidAskCandles.candles
      : Array.isArray(result?.bidCandles?.candles) ? result.bidCandles.candles
      : Array.isArray(result?.askCandles?.candles) ? result.askCandles.candles
      : Array.isArray(result?.data?.candles) ? result.data.candles : [];
    attempts.push({ priceType, rows, fields: Object.keys(result || {}).join(", ") || "empty response" });
    const parsed = parseRows(rows);
    if (parsed.length) {
      candleCache.set(candleKey, { candles: parsed, expiresAt: Date.now() + 4_000 });
      return parsed;
    }
  }

  const counts = attempts.map((a) => `${a.priceType}=${a.rows.length}`).join(", ");
  const shapes = attempts.map((a) => `${a.priceType}[${a.fields}]`).join("; ");
  throw new Error(
    `Exness returned no ${tf.api} candles for ${instrument} in requested UTC window ${from} to ${to}. ` +
    `Rows by price_type: ${counts}. Response fields: ${shapes}. ` +
    `Instrument is listed on the account, but this history window returned no candles.`
  );
}

export async function getExnessLiveTick(credentials: ExnessCredentials, symbol: string, timeoutMs = 2500) {
  const instrument = symbol === "XAU/USD" ? "XAUUSD" : symbol === "XAG/USD" ? "XAGUSD" : "";
  if (!instrument) throw new Error("Unsupported Exness instrument.");
  const path = `/v1/server-events/accounts/${credentials.accountId}/ws/ticks`;
  // Live ticks also belong to the account Access Point, not the discovery host.
  const accessPoint = await getResolvedAccessPoint(credentials);
  const host = new URL(accessPoint).host;
  const headers = signedHeaders(credentials, "GET", path);
  const ws = new WebSocket(`wss://${host}${path}`, { headers, handshakeTimeout: timeoutMs });
  return await new Promise<{ bid: number; ask: number; timestamp: string }>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error, value?: { bid: number; ask: number; timestamp: string }) => {
      if (settled) return; settled = true; clearTimeout(timer);
      try { ws.close(); } catch {}
      if (err) reject(err); else resolve(value!);
    };
    const timer = setTimeout(() => finish(new Error("Timed out waiting for an Exness live tick.")), timeoutMs);
    ws.on("error", (e) => finish(new Error(`Exness tick stream failed: ${e.message}`)));
    ws.on("open", () => ws.send(JSON.stringify({ id: `edge-${Date.now()}`, subscribe: { event: "ticks", instruments: [instrument] } })));
    ws.on("message", (raw) => {
      let message: any;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message?.code && Number(message.code) !== 0) return finish(new Error(`Exness tick subscription error: ${message.error_message || message.code}`));
      const tick = Array.isArray(message) ? message.find((x: any) => x.instrument === instrument) : message;
      if (tick?.instrument === instrument && Number.isFinite(Number(tick.bid)) && Number.isFinite(Number(tick.ask))) {
        finish(undefined, { bid: Number(tick.bid), ask: Number(tick.ask), timestamp: tick.timestamp || new Date().toISOString() });
      }
    });
  });
}
