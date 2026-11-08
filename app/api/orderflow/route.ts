import { NextRequest, NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/server/require-feature-access";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { buildFootprint, buildVolumeProfile, calculateValueArea } from "@/lib/orderflow/engine";
import type { OrderFlowInstrument } from "@/lib/orderflow/providers/types";
import { MockOrderFlowProvider } from "@/lib/orderflow/providers/mock";
import { storeOrderFlowTrades } from "@/lib/orderflow/storage";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICK_SIZE: Record<OrderFlowInstrument, number> = { GC: 0.1, SI: 0.005 };
const INTERVAL_MS = 5 * 60 * 1_000;

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "orderflow", 60, 60);
  if (limited) return limited;
  const access = await requireFeatureAccess(request, "Order Flow Footprint");
  if (!access.allowed) return access.response;
  const userLimited = await enforceRateLimit({ key: `uid:${access.uid}:orderflow`, limit: 60, windowSeconds: 60 });
  if (userLimited) return userLimited;
  const instrument = (request.nextUrl.searchParams.get("instrument") || "GC").toUpperCase();
  if (instrument !== "GC" && instrument !== "SI") {
    return NextResponse.json({ status: "error", error: "Use instrument=GC or instrument=SI" }, { status: 400 });
  }

  // Deliberately demo-only until a licensed exchange-trade provider is configured.
  if (process.env.ORDERFLOW_DATA_MODE !== "demo") {
    return NextResponse.json({
      status: "unavailable",
      mode: "unavailable",
      instrument,
      trades: [],
      footprint: [],
      profile: [],
      valueArea: { poc: null, vah: null, val: null },
      disclaimer: "No live trade feed is configured. OHLC candles and TradingView embeds are not substituted for executed trades.",
    }, { headers: { "Cache-Control": "no-store" }, status: 503 });
  }

  const provider = new MockOrderFlowProvider();
  const feed = await provider.getRecentTrades(instrument as OrderFlowInstrument);
  const storedTradeCount = storeOrderFlowTrades(feed.instrument, feed.trades, feed.source);
  const footprint = buildFootprint(feed.trades, { tickSize: TICK_SIZE[feed.instrument], intervalMs: INTERVAL_MS });
  const profile = buildVolumeProfile(feed.trades, TICK_SIZE[feed.instrument]);
  const valueArea = calculateValueArea(profile, 70);

  return NextResponse.json({
    status: "ok",
    mode: feed.mode,
    instrument: feed.instrument,
    source: feed.source,
    dataNote: feed.dataNote,
    tradeCount: feed.trades.length,
    storedTradeCount,
    footprint,
    profile,
    valueArea,
  }, { headers: { "Cache-Control": "no-store" } });
}
