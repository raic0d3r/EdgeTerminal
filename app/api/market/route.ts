import { NextRequest, NextResponse } from "next/server";
import { getCTraderConfig, getFreshCTraderSession } from "@/lib/ctrader/session";
import { probeFpMarketsLiveData } from "@/lib/ctrader/market-probe";
import { getFpMarketsCandles } from "@/lib/ctrader/candles";
import { getAdminServices, isAllowlistedAdmin } from "@/lib/firebase-admin";
import { decryptExnessCredentials } from "@/lib/exness/vault";
import { getExnessCandles, getExnessLiveTick } from "@/lib/exness/market-data";
import type { ExnessCredentials } from "@/lib/exness/client";
import { getExnessTestCredentials, isExnessTestModeEnabled } from "@/lib/exness/test-mode";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_INTERVALS = new Set(["1min", "5min", "15min", "30min", "1h", "4h", "1day"]);
const ALLOWED_SYMBOLS = new Set(["XAU/USD", "XAG/USD"]);

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "market-data", 60, 60);
  if (limited) return limited;
  const symbol = (request.nextUrl.searchParams.get("symbol") || "XAU/USD").toUpperCase();
  const interval = request.nextUrl.searchParams.get("interval") || "5min";
  const requestedProvider = request.nextUrl.searchParams.get("provider");
  const purpose = request.nextUrl.searchParams.get("purpose");
  const isToolbarQuote = purpose === "toolbar";

  const provider = (requestedProvider || "ctrader").toLowerCase();
  if (provider !== "exness" && provider !== "ctrader") {
    return NextResponse.json({ status: "unavailable", provider, error: "Unsupported market-data provider. Choose Exness or cTrader." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (provider === "exness") {
    if (!ALLOWED_SYMBOLS.has(symbol)) return NextResponse.json({ status: "error", provider, error: "Only XAU/USD and XAG/USD are supported." }, { status: 400 });
    if (!ALLOWED_INTERVALS.has(interval)) return NextResponse.json({ status: "error", provider, error: "Unsupported candle interval." }, { status: 400 });
    try {
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return NextResponse.json({ status: "unavailable", provider, error: "Sign in to use your connected Exness account." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      const { adminAuth, adminDb } = getAdminServices();
      const user = await adminAuth.verifyIdToken(token, true);
      let credentials: ExnessCredentials;
      // Admin-only test credentials override the per-user vault only for allowlisted admins.
      if (isExnessTestModeEnabled() && isAllowlistedAdmin(user.email)) {
        credentials = getExnessTestCredentials();
      } else {
        const snap = await adminDb.collection("users").doc(user.uid).collection("brokerConnections").doc("exness").get();
        if (!snap.exists || !snap.data()?.encryptedCredentials) return NextResponse.json({ status: "unavailable", provider, error: "No Exness account is connected to this user." }, { status: 401, headers: { "Cache-Control": "no-store" } });
        credentials = decryptExnessCredentials(String(snap.data()!.encryptedCredentials));
      }
      // Historical candles must not depend on the live WebSocket being open.
      // For the compact toolbar quote, the requested M1 window can be empty
      // after a long market closure (e.g. weekend). Retry progressively wider
      // broker timeframes and use the most recent Exness candle close. This is
      // still Exness-only data; it never falls back to cTrader or synthetic data.
      let candles: Awaited<ReturnType<typeof getExnessCandles>>;
      let candleIntervalUsed = interval;
      try {
        // Use the largest supported history window for the chart as well as
        // the compact toolbar. A 300-bar window can be too short after a
        // weekend/holiday, especially on M15 and higher timeframes.
        candles = await getExnessCandles(credentials, symbol, interval, 500);
      } catch (primaryError) {
        // If the selected timeframe genuinely has no returned history, keep
        // the Exness chart usable by trying another Exness timeframe. This is
        // never a cTrader fallback. Return the actual interval used so the UI
        // can disclose the resolution rather than silently inventing bars.
        const fallbackIntervals = ["5min", "15min", "30min", "1h", "4h", "1day"].filter((value) => value !== interval);
        let recovered: Awaited<ReturnType<typeof getExnessCandles>> | null = null;
        let lastError: unknown = primaryError;
        for (const fallbackInterval of fallbackIntervals) {
          try {
            recovered = await getExnessCandles(credentials, symbol, fallbackInterval, 500);
            candleIntervalUsed = fallbackInterval;
            break;
          } catch (error) { lastError = error; }
        }
        if (!recovered) throw lastError;
        candles = recovered;
      }
      let tick: Awaited<ReturnType<typeof getExnessLiveTick>> | null = null;
      let tickError: string | null = null;
      try {
        tick = await getExnessLiveTick(credentials, symbol);
      } catch (error) {
        tickError = error instanceof Error ? error.message : "Exness live quote unavailable";
      }
      const lastCandle = candles[candles.length - 1];
      // If Exness has no live tick (for example, while the market is closed),
      // show the most recent broker candle close in the toolbar and label it
      // LAST CLOSE. Never substitute a cTrader or synthetic price.
      const hasLiveTick = Boolean(tick);
      const price = tick ? (tick.bid + tick.ask) / 2 : (lastCandle?.close ?? null);
      const previous = candles.length > 1 ? candles[candles.length - 2] : undefined;
      const data = {
        symbol, price, lastCandleClose: lastCandle?.close ?? null, bid: tick?.bid ?? null, ask: tick?.ask ?? null,
        candleIntervalUsed,
        change: previous && price != null ? price - previous.close : null,
        changePercent: previous?.close && price != null ? ((price - previous.close) / previous.close) * 100 : null,
        currency: "USD" as const, source: "Exness", mode: hasLiveTick ? "live" as const : "closed" as const,
        updatedAt: tick ? new Date(tick.timestamp).toISOString() : (lastCandle?.time ?? null),
        candles, volumeType: "tick" as const,
        dataNote: tick
          ? `Exness account-specific live bid/ask and historical candles${candleIntervalUsed !== interval ? `; historical candles are ${candleIntervalUsed} because ${interval} was unavailable` : ""}. Quote ticks are not executed trades.`
          : `No live Exness quote is available. Displaying the most recent Exness candle close as LAST CLOSE${candleIntervalUsed !== interval ? `; historical candles are ${candleIntervalUsed} because ${interval} was unavailable` : ""}.`,
      };
      return NextResponse.json({
        status: hasLiveTick ? "live" : "closed", provider: "exness",
        disclaimer: "Exness account-specific data only. No cTrader or synthetic fallback.",
        ...(tickError ? { quoteStatus: "unavailable", quoteError: tickError } : {}),
        data,
      }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      const authFailure = code.startsWith("auth/");
      return NextResponse.json(
        { status: "unavailable", provider: "exness", disclaimer: "Exness data could not be verified. No other provider or demo price is substituted.", error: authFailure ? "Your session is invalid or revoked. Sign in again." : "Exness market data is temporarily unavailable." },
        { status: authFailure ? 401 : 502, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    return NextResponse.json({ status: "error", provider: "ctrader", error: "Only XAU/USD and XAG/USD are supported by the connected cTrader account." }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ status: "error", provider: "ctrader", error: "Unsupported candle interval." }, { status: 400 });
  }

  let sessionResult: Awaited<ReturnType<typeof getFreshCTraderSession>> = { session: null, refreshed: false, uid: null };
  try {
    sessionResult = await getFreshCTraderSession(request);
    const session = sessionResult.session;
    if (!session) {
      const response = NextResponse.json({
        status: "unavailable",
        provider: "ctrader",
        error: "cTrader session is missing, expired, or could not be refreshed. Reconnect cTrader.",
      }, { status: 401, headers: { "Cache-Control": "no-store" } });
      return response;
    }

    const { clientId, clientSecret } = getCTraderConfig();
    // Historical bars and the live quote are independent. A missing spot event
    // must not discard valid cTrader history when the market is closed.
    const [probeResult, historyResult] = await Promise.allSettled([
      probeFpMarketsLiveData({
        clientId,
        clientSecret,
        accessToken: session.accessToken,
        sampleMs: 1800,
        includeDepth: false,
      }),
      getFpMarketsCandles({
        clientId,
        clientSecret,
        accessToken: session.accessToken,
        symbol: symbol as "XAU/USD" | "XAG/USD",
        interval,
        limit: 300,
      }),
    ]);
    if (historyResult.status === "rejected") throw historyResult.reason;
    const history = historyResult.value;
    const probe = probeResult.status === "fulfilled" ? probeResult.value : null;
    const wanted = symbol === "XAG/USD" ? "XAGUSD" : "XAUUSD";
    const liveQuote = probe?.quotes.find((item) => item.requested === wanted && item.spotEventReceived);

    const candles = history.candles.map((bar) => ({
      time: new Date(bar.time).toISOString(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      volumeType: "tick" as const,
    }));
    const hasLiveQuote = Boolean(liveQuote && liveQuote.bid != null && liveQuote.ask != null);
    const lastCandle = candles[candles.length - 1];
    const price = hasLiveQuote ? (liveQuote!.bid! + liveQuote!.ask!) / 2 : lastCandle.close;
    const previous = candles.length > 1 ? candles[candles.length - 2] : undefined;

    const data = {
      symbol,
      price,
      bid: hasLiveQuote ? liveQuote!.bid : null,
      ask: hasLiveQuote ? liveQuote!.ask : null,
      change: hasLiveQuote && previous ? price - previous.close : null,
      changePercent: hasLiveQuote && previous?.close ? ((price - previous.close) / previous.close) * 100 : null,
      currency: "USD" as const,
      source: "cTrader",
      mode: hasLiveQuote ? "live" as const : "closed" as const,
      updatedAt: hasLiveQuote && liveQuote?.timestamp ? new Date(Number(liveQuote.timestamp)).toISOString() : lastCandle.time,
      candles,
      volumeType: "tick" as const,
      dataNote: "All prices and historical OHLC candles are sourced exclusively from the connected cTrader account. Candle volume is broker-reported tick volume, not verified executed volume. Spot quotes are not aggressor-side trades; footprint buy/sell values remain estimates.",
    };

    const response = NextResponse.json({
      status: hasLiveQuote ? "live" : "closed",
      provider: "ctrader",
      disclaimer: "Broker-specific CFD prices. cTrader is the only market-data source; no BiQuote or iTick fallback. Candle volume is tick volume, not verified executed trade volume.",
      data,
      tokenRefreshed: sessionResult.refreshed,
    }, { headers: { "Cache-Control": "private, no-store" } });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cTrader error";
    const response = NextResponse.json({
      status: "unavailable",
      provider: "ctrader",
      disclaimer: "cTrader data could not be verified. No other provider or demo price is substituted.",
      error: message,
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
    return response;
  }
}
