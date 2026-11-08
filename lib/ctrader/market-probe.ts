import WebSocket from "ws";

type Envelope = {
  clientMsgId?: string;
  payloadType?: number;
  payload?: Record<string, unknown>;
};

type Account = Record<string, unknown>;
type SymbolInfo = Record<string, unknown>;

const LIVE_WS_URL = "wss://live.ctraderapi.com:5036";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const msgId = () => `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function parseMessage(raw: WebSocket.RawData): Envelope | null {
  try {
    const text = typeof raw === "string" ? raw : Buffer.from(raw as Buffer).toString("utf8");
    return JSON.parse(text) as Envelope;
  } catch {
    return null;
  }
}

function safeString(value: unknown): string {
  return value == null ? "" : String(value);
}

/**
 * Short-lived, read-only market-data probe for the cTrader broker live cTrader account.
 * It resolves the account by broker title (never by a user-supplied account ID),
 * lists its symbols, subscribes to spot and depth updates, then closes the socket.
 */
export async function probeFpMarketsLiveData(input: {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  sampleMs?: number;
  includeDepth?: boolean;
}) {
  const ws = new WebSocket(LIVE_WS_URL, { handshakeTimeout: 10_000 });
  const unsolicited: Envelope[] = [];
  const pending = new Map<string, (message: Envelope) => void>();
  let socketError: Error | null = null;

  const onMessage = (raw: WebSocket.RawData) => {
    const message = parseMessage(raw);
    if (!message) return;
    if (message.clientMsgId && pending.has(message.clientMsgId)) {
      const resolve = pending.get(message.clientMsgId)!;
      pending.delete(message.clientMsgId);
      resolve(message);
    } else {
      unsolicited.push(message);
    }
  };
  const onError = (error: Error) => { socketError = error; };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cTrader live WebSocket connection timed out.")), 12_000);
      ws.once("open", () => { clearTimeout(timer); resolve(); });
      ws.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    ws.on("message", onMessage);
    ws.on("error", onError);

    const request = async (payloadType: number, payload: Record<string, unknown>, expectedType: number): Promise<Envelope> => {
      if (socketError) throw socketError;
      const clientMsgId = msgId();
      const responsePromise = new Promise<Envelope>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(clientMsgId);
          reject(new Error(`cTrader response timed out for payload ${expectedType}.`));
        }, 12_000);
        pending.set(clientMsgId, (message) => {
          clearTimeout(timer);
          if (message.payloadType === 50 || message.payloadType === 2142) {
            reject(new Error(safeString(message.payload?.description || message.payload?.errorCode || "cTrader API error").slice(0, 220)));
          } else if (message.payloadType !== expectedType) {
            reject(new Error(`Unexpected cTrader response type ${message.payloadType ?? "unknown"}.`));
          } else {
            resolve(message);
          }
        });
      });
      ws.send(JSON.stringify({ clientMsgId, payloadType, payload }), (error) => {
        if (error) {
          pending.delete(clientMsgId);
        }
      });
      return responsePromise;
    };

    await request(2100, { clientId: input.clientId, clientSecret: input.clientSecret }, 2101);
    const accountResponse = await request(2149, { accessToken: input.accessToken }, 2150);
    const accounts = Array.isArray(accountResponse.payload?.ctidTraderAccount)
      ? accountResponse.payload!.ctidTraderAccount as Account[]
      : [];
    const fpAccount = accounts.find((account) =>
      account.isLive === true && /fpmarkets/i.test(safeString(account.brokerTitleShort)),
    );
    if (!fpAccount) {
      throw new Error("No live cTrader broker account was found in the cTrader account list. No account was selected.");
    }
    // cTrader's ProtoOA messages define ctidTraderAccountId as an integer.
    // Keep it numeric in JSON; passing a quoted string (or a string that
    // itself contains quote characters) causes the server parse error:
    // Couldn't parse integer: For input string: "\"46445600\"".
    const accountId = Number(fpAccount.ctidTraderAccountId);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      throw new Error("cTrader broker account response contained an invalid account ID.");
    }

    await request(2102, { ctidTraderAccountId: accountId, accessToken: input.accessToken }, 2103);
    const symbolsResponse = await request(2114, { ctidTraderAccountId: accountId }, 2115);
    const symbols = Array.isArray(symbolsResponse.payload?.symbol)
      ? symbolsResponse.payload!.symbol as SymbolInfo[]
      : [];

    const wanted = [
      { key: "XAUUSD", match: (name: string) => /^XAUUSD(?:\.|$|[-_])/i.test(name) || name.toUpperCase() === "XAUUSD" },
      { key: "XAGUSD", match: (name: string) => /^XAGUSD(?:\.|$|[-_])/i.test(name) || name.toUpperCase() === "XAGUSD" },
    ];
    const selected = wanted.map((target) => {
      const symbol = symbols.find((entry) => target.match(safeString(entry.symbolName)));
      return symbol ? {
        requested: target.key,
        symbolId: safeString(symbol.symbolId),
        symbolName: safeString(symbol.symbolName),
        digits: symbol.digits == null ? null : Number(symbol.digits),
      } : { requested: target.key, symbolId: null, symbolName: null, digits: null };
    });

    const available = selected.filter((entry) => entry.symbolId);
    const spotSubscribeAcks: number[] = [];
    const depthSubscribeAcks: number[] = [];
    for (const symbol of available) {
      const id = Number(symbol.symbolId);
      const spotAck = await request(2127, {
        ctidTraderAccountId: accountId,
        symbolId: [id],
        subscribeToSpotTimestamp: true,
      }, 2128);
      spotSubscribeAcks.push(Number(spotAck.payloadType));
      if (input.includeDepth !== false) {
        const depthAck = await request(2156, {
          ctidTraderAccountId: accountId,
          symbolId: [id],
        }, 2157);
        depthSubscribeAcks.push(Number(depthAck.payloadType));
      }
    }

    await sleep(Math.max(2500, Math.min(input.sampleMs ?? 7000, 10_000)));

    const spotEvents = unsolicited.filter((message) => message.payloadType === 2131);
    const depthEvents = unsolicited.filter((message) => message.payloadType === 2155);
    const quotes = selected.map((symbol) => {
      const event = [...spotEvents].reverse().find((message) =>
        safeString(message.payload?.symbolId) === safeString(symbol.symbolId),
      );
      const bidRaw = event?.payload?.bid;
      const askRaw = event?.payload?.ask;
      const digits = Number.isInteger(symbol.digits) ? Number(symbol.digits) : null;
      const scale = digits == null ? 100000 : 100000;
      return {
        requested: symbol.requested,
        symbolName: symbol.symbolName,
        available: Boolean(symbol.symbolId),
        spotEventReceived: Boolean(event),
        bid: bidRaw == null ? null : Number(bidRaw) / scale,
        ask: askRaw == null ? null : Number(askRaw) / scale,
        rawBid: bidRaw == null ? null : String(bidRaw),
        rawAsk: askRaw == null ? null : String(askRaw),
        timestamp: event?.payload?.timestamp == null ? null : String(event.payload.timestamp),
      };
    });

    const depthSummary = selected.map((symbol) => {
      const events = depthEvents.filter((message) =>
        safeString(message.payload?.symbolId) === safeString(symbol.symbolId),
      );
      const quoteCounts = events.map((event) => Array.isArray(event.payload?.newQuotes) ? (event.payload!.newQuotes as unknown[]).length : 0);
      return {
        requested: symbol.requested,
        symbolName: symbol.symbolName,
        depthEventCount: events.length,
        newQuoteCount: quoteCounts.reduce((sum, count) => sum + count, 0),
        sampleFields: events[0] && Array.isArray(events[0].payload?.newQuotes) && events[0].payload!.newQuotes.length > 0
          ? Object.keys((events[0].payload!.newQuotes as Record<string, unknown>[])[0])
          : [],
      };
    });

    return {
      connected: true,
      environment: "live",
      broker: safeString(fpAccount.brokerTitleShort),
      accountMatched: true,
      permission: "accounts (view-only)",
      symbolCount: symbols.length,
      symbols: selected,
      quotes,
      depth: depthSummary,
      sampleWindowMs: Math.max(2500, Math.min(input.sampleMs ?? 7000, 10_000)),
      notes: [
        "Quote values are broker-specific cTrader broker CFD prices, not consolidated global spot prices.",
        "A successful depth subscription acknowledgement does not prove depth updates were received.",
        "Spot bid/ask updates are quotes, not executed trades; they cannot by themselves produce genuine aggressor-side footprint volume.",
        "No order, position, or account setting was changed.",
      ],
    };
  } finally {
    for (const resolve of pending.values()) {
      try { resolve({ payloadType: -1, payload: {} }); } catch { /* ignore */ }
    }
    pending.clear();
    ws.off("message", onMessage);
    ws.off("error", onError);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1200);
        ws.once("close", () => { clearTimeout(timer); resolve(); });
        try { ws.close(1000, "Market data probe complete"); } catch { clearTimeout(timer); resolve(); }
      });
    }
  }
}
