import { NextRequest, NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/server/require-feature-access";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { buildFootprint, buildVolumeProfile, calculateValueArea } from "@/lib/orderflow/engine";
import { getOrderFlowHistoryStats, getStoredOrderFlowTrades } from "@/lib/orderflow/storage";
import type { OrderFlowInstrument } from "@/lib/orderflow/providers/types";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TICK_SIZE: Record<OrderFlowInstrument, number> = { GC: 0.1, SI: 0.005 };
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "orderflow-history", 60, 60);
  if (limited) return limited;
  const access = await requireFeatureAccess(request, "Order Flow Footprint");
  if (!access.allowed) return access.response;
  const userLimited = await enforceRateLimit({ key: `uid:${access.uid}:orderflow`, limit: 60, windowSeconds: 60 });
  if (userLimited) return userLimited;
  const params = request.nextUrl.searchParams;
  const instrument = (params.get("instrument") || "GC").toUpperCase();
  if (instrument !== "GC" && instrument !== "SI") {
    return NextResponse.json({ status: "error", error: "Use instrument=GC or instrument=SI" }, { status: 400 });
  }
  const to = Number(params.get("to") || Date.now());
  const from = Number(params.get("from") || (to - DEFAULT_WINDOW_MS));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > MAX_WINDOW_MS) {
    return NextResponse.json({ status: "error", error: "Provide valid millisecond timestamps; window must be at most 7 days" }, { status: 400 });
  }
  const stats = getOrderFlowHistoryStats(instrument as OrderFlowInstrument);
  const trades = getStoredOrderFlowTrades(instrument as OrderFlowInstrument, from, to);
  const tickSize = TICK_SIZE[instrument as OrderFlowInstrument];
  const footprint = buildFootprint(trades, { tickSize, intervalMs: 5 * 60 * 1000 });
  const profile = buildVolumeProfile(trades, tickSize);
  return NextResponse.json({
    status: "ok", instrument, mode: "stored-history",
    dataNote: "Historical records are only as reliable as their original source. Synthetic demo records remain simulated, not exchange data.",
    range: { from, to }, storedTradeCount: trades.length, totalStoredTradeCount: stats.tradeCount,
    firstTimestamp: stats.firstTimestamp, lastTimestamp: stats.lastTimestamp,
    truncated: trades.length >= 20_000,
    footprint, profile, valueArea: calculateValueArea(profile, 70),
  }, { headers: { "Cache-Control": "no-store" } });
}
