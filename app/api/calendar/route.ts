import { NextRequest, NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/server/require-feature-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireFeatureAccess(request, "Monetary Policy Watch & Macro Events");
  if (!access.allowed) return access.response;
  const mode = process.env.ECONOMIC_DATA_MODE === "live" ? "live" : "demo";
  if (mode === "demo") {
    return NextResponse.json({
      status: "demo",
      disclaimer: "Demo mode: no current economic events are being provided.",
      source: null,
      events: []
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const key = process.env.TRADING_ECONOMICS_API_KEY;
  const secret = process.env.TRADING_ECONOMICS_API_SECRET;
  if (!key || !secret) {
    return NextResponse.json({
      status: "unavailable",
      error: "Economic live mode requires Trading Economics API credentials.",
      events: []
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  // Provider-specific response mapping should be validated against your subscribed
  // Trading Economics plan and current API documentation before enabling production.
  const credentials = `${key}:${secret}`;
  const url = `https://api.tradingeconomics.com/calendar?c=${encodeURIComponent(credentials)}&format=json`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({
        status: "unavailable",
        error: `Economic provider returned HTTP ${response.status}.`,
        events: []
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return NextResponse.json({
        status: "unavailable",
        error: "Unexpected economic provider response shape.",
        events: []
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      status: "live",
      source: "Trading Economics",
      disclaimer: "Check provider timestamps, plan entitlements, and redistribution rights before public display.",
      events: payload
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      status: "unavailable",
      error: "Economic provider could not be reached. No sample events have been substituted.",
      events: []
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
