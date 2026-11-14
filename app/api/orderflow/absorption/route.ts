import { NextRequest, NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/server/require-feature-access";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { detectAbsorptionCandidates } from "@/lib/orderflow/engine";
import { getStoredOrderFlowTrades } from "@/lib/orderflow/storage";
import type { OrderFlowInstrument } from "@/lib/orderflow/providers/types";
import { storeOrderFlowTrades } from "@/lib/orderflow/storage";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TICK_SIZE: Record<OrderFlowInstrument, number> = { GC: 0.1, SI: 0.005 };
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "orderflow-absorption", 60, 60);
  if (limited) return limited;
  const access = await requireFeatureAccess(request, "Order Flow Footprint");
  if (!access.allowed) return access.response;
  const userLimited = await enforceRateLimit({ key: `uid:${access.uid}:orderflow`, limit: 60, windowSeconds: 60 });
  if (userLimited) return userLimited;
  const params = request.nextUrl.searchParams;
  const instrument = (params.get("instrument") || "GC").toUpperCase();
  if (instrument !== "GC" && instrument !== "SI") {
    return NextResponse.json({ status: "error", error: "Use instrument=GC or SI" }, { status: 400 });
  }
  const to = Number(params.get("to") || Date.now());
  const from = Number(params.get("from") || (to - 24 * 60 * 60 * 1000));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > MAX_WINDOW_MS) {
    return NextResponse.json({ status: "error", error: "Invalid range; maximum window is 7 days" }, { status: 400 });
  }
  const key = instrument as OrderFlowInstrument;
  // Spot-metal mode uses the selected broker candles for price/volume analysis.
  // This endpoint only reports previously stored trade prints; it does not invent
  // aggressor-side executions from OHLC or broker tick-volume data.
  const providerStatus = "broker-only" as const;
  const providerError: string | null = null;
  // Do not mix old COMEX/demo records into a spot-metal analysis. Only a future
  // explicitly tagged broker-spot execution source may feed absorption here.
  const storedTrades = getStoredOrderFlowTrades(key, from, to, 20_000);
  const trades = storedTrades.filter(trade => trade.source.startsWith("broker-spot:"));
  const candidates = detectAbsorptionCandidates(trades, { tickSize: TICK_SIZE[key] });
  return NextResponse.json({
    status: "ok", instrument: key, mode: "heuristic-candidates", providerStatus, providerError,
    dataNote: "Spot-metal analysis uses your selected cTrader or Exness broker candles. Broker-reported volume is tick volume, not verified executed volume or buyer/seller aggressor flow. Any stored trade prints are historical/demo records unless their source is independently verified; absorption candidates are heuristic and do not prove hidden orders.",
    range: { from, to }, storedTradeCount: trades.length, totalStoredTradeCount: trades.length,
    candidateCount: candidates.length, candidates,
  }, { headers: { "Cache-Control": "no-store" } });
}
