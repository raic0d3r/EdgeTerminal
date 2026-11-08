import WebSocket from "ws";

type Envelope = { clientMsgId?: string; payloadType?: number; payload?: Record<string, unknown> };
const URL = "wss://live.ctraderapi.com:5036";
const makeId = () => `edge-bars-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const asString = (v: unknown) => v == null ? "" : String(v);
const PERIODS: Record<string, number> = { "1min": 1, "5min": 5, "15min": 7, "30min": 8, "1h": 9, "4h": 10, "1day": 12 };

export type CTraderCandle = { time: number; open: number; high: number; low: number; close: number; volume: number; volumeType: "tick" };

export async function getFpMarketsCandles(input: {
  clientId: string; clientSecret: string; accessToken: string;
  symbol: "XAU/USD" | "XAG/USD"; interval: string; limit?: number;
}): Promise<{ symbol: string; interval: string; candles: CTraderCandle[]; broker: string }> {
  const period = PERIODS[input.interval];
  if (!period) throw new Error(`Unsupported cTrader candle interval: ${input.interval}`);
  const ws = new WebSocket(URL, { handshakeTimeout: 10_000 });
  const pending = new Map<string, (message: Envelope) => void>();
  const onMessage = (raw: WebSocket.RawData) => {
    let message: Envelope;
    try { message = JSON.parse(Buffer.from(raw as Buffer).toString("utf8")) as Envelope; } catch { return; }
    const id = message.clientMsgId;
    if (id && pending.has(id)) pending.get(id)!(message);
  };
  const request = (type: number, payload: Record<string, unknown>, expected: number) => new Promise<Envelope>((resolve, reject) => {
    const clientMsgId = makeId();
    const timer = setTimeout(() => { pending.delete(clientMsgId); reject(new Error(`cTrader candle request timed out (response ${expected}).`)); }, 12_000);
    pending.set(clientMsgId, (message) => {
      clearTimeout(timer); pending.delete(clientMsgId);
      if (message.payloadType === 50 || message.payloadType === 2142) reject(new Error(asString(message.payload?.description || message.payload?.errorCode || "cTrader API error")));
      else if (message.payloadType !== expected) reject(new Error(`Unexpected cTrader response ${message.payloadType}; expected ${expected}.`));
      else resolve(message);
    });
    ws.send(JSON.stringify({ clientMsgId, payloadType: type, payload }), (error) => {
      if (error) { clearTimeout(timer); pending.delete(clientMsgId); reject(error); }
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cTrader WebSocket connection timed out.")), 12_000);
      ws.once("open", () => { clearTimeout(timer); resolve(); });
      ws.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    ws.on("message", onMessage);
    await request(2100, { clientId: input.clientId, clientSecret: input.clientSecret }, 2101);
    const accountsRes = await request(2149, { accessToken: input.accessToken }, 2150);
    const accounts = Array.isArray(accountsRes.payload?.ctidTraderAccount) ? accountsRes.payload!.ctidTraderAccount as Record<string, unknown>[] : [];
    const account = accounts.find(a => a.isLive === true && /fpmarkets/i.test(asString(a.brokerTitleShort)));
    if (!account) throw new Error("No live cTrader broker account is available to this cTrader session.");
    const accountId = Number(account.ctidTraderAccountId);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new Error("Invalid cTrader broker account ID returned by cTrader.");
    await request(2102, { ctidTraderAccountId: accountId, accessToken: input.accessToken }, 2103);
    const symbolsRes = await request(2114, { ctidTraderAccountId: accountId }, 2115);
    const symbols = Array.isArray(symbolsRes.payload?.symbol) ? symbolsRes.payload!.symbol as Record<string, unknown>[] : [];
    const target = input.symbol === "XAG/USD" ? "XAGUSD" : "XAUUSD";
    const symbol = symbols.find(s => {
      const name = asString(s.symbolName).toUpperCase();
      return name === target || name.startsWith(`${target}.`) || name.startsWith(`${target}_`) || name.startsWith(`${target}-`);
    });
    if (!symbol) throw new Error(`${target} is not available on the connected cTrader broker account.`);
    const symbolId = Number(symbol.symbolId);
    if (!Number.isSafeInteger(symbolId) || symbolId <= 0) throw new Error(`cTrader broker returned an invalid symbol ID for ${target}.`);
    const limit = Math.max(20, Math.min(input.limit ?? 300, 500));
    const to = Date.now();
    // Use cTrader's count-based history window instead of deriving fromTimestamp
    // from the bar interval. A fixed 300-minute window returns zero M1 bars when
    // the market has been closed for a weekend or holiday, even though history
    // exists. count asks cTrader for the latest N bars before toTimestamp.
    const barsRes = await request(2137, {
      ctidTraderAccountId: accountId,
      symbolId,
      period,
      toTimestamp: to,
      count: limit,
    }, 2138);
    const rawBars = Array.isArray(barsRes.payload?.trendbar) ? barsRes.payload!.trendbar as Record<string, unknown>[] :
      Array.isArray(barsRes.payload?.trendBar) ? barsRes.payload!.trendBar as Record<string, unknown>[] : [];
    const candles = rawBars.map((bar): CTraderCandle | null => {
      const lowRaw = Number(bar.low);
      const openDelta = Number(bar.deltaOpen ?? 0);
      const closeDelta = Number(bar.deltaClose ?? 0);
      const highDelta = Number(bar.deltaHigh ?? 0);
      const minute = Number(bar.utcTimestampInMinutes);
      if (![lowRaw, openDelta, closeDelta, highDelta, minute].every(Number.isFinite)) return null;
      const low = lowRaw / 100_000;
      const open = (lowRaw + openDelta) / 100_000;
      const close = (lowRaw + closeDelta) / 100_000;
      const high = (lowRaw + highDelta) / 100_000;
      return { time: minute * 60_000, open, high: Math.max(high, open, close, low), low: Math.min(low, open, close, high), close, volume: Number(bar.volume ?? 0), volumeType: "tick" };
    }).filter((bar): bar is CTraderCandle => bar !== null).sort((a, b) => a.time - b.time);
    if (!candles.length) {
      const responseKeys = Object.keys(barsRes.payload ?? {});
      const responseSymbol = asString(barsRes.payload?.symbolId || symbolId);
      const responsePeriod = asString(barsRes.payload?.period || period);
      throw new Error(`cTrader broker returned an empty ${input.interval} history response for ${target} (symbolId ${responseSymbol}, period ${responsePeriod}, fields: ${responseKeys.join(",") || "none"}). Check the broker's historical-data availability for this symbol.`);
    }
    return { symbol: target, interval: input.interval, candles, broker: asString(account.brokerTitleShort) };
  } finally {
    for (const resolve of pending.values()) resolve({ payloadType: -1, payload: {} });
    pending.clear(); ws.off("message", onMessage);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, 1000); ws.once("close", () => { clearTimeout(timer); resolve(); }); try { ws.close(1000, "Historical candles complete"); } catch { clearTimeout(timer); resolve(); } });
    }
  }
}
