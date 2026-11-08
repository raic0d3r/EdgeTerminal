import { NextRequest, NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/server/require-feature-access";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getStoredOrderFlowTrades, getOrderFlowHistoryStats } from "@/lib/orderflow/storage";
import type { OrderFlowInstrument } from "@/lib/orderflow/providers/types";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TRADES = 5_000;

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "orderflow-replay", 60, 60);
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
  const stats = getOrderFlowHistoryStats(instrument as OrderFlowInstrument);
  const latest = stats.lastTimestamp ?? Date.now();
  const to = Number(params.get("to") || latest + 1);
  const from = Number(params.get("from") || Math.max(0, to - 24 * 60 * 60 * 1000));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > MAX_RANGE_MS) {
    return NextResponse.json({ status: "error", error: "Use valid millisecond timestamps with a range no longer than 7 days" }, { status: 400 });
  }
  const trades = getStoredOrderFlowTrades(instrument as OrderFlowInstrument, from, to, MAX_TRADES);
  return NextResponse.json({
    status: "ok", instrument, mode: "stored-history-replay",
    dataNote: "Replay uses stored records in timestamp order. Synthetic records remain simulated, not exchange data.",
    range: { from, to }, tradeCount: trades.length, totalStoredTradeCount: stats.tradeCount,
    truncated: trades.length === MAX_TRADES,
    trades: trades.map(({ id, timestamp, price, quantity, side, source }) => ({ id, timestamp, price, quantity, side, source })),
  }, { headers: { "Cache-Control": "no-store" } });
}
