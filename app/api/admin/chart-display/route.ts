import { NextRequest, NextResponse } from "next/server";
import { isAllowlistedAdmin, requireUser } from "@/lib/server/auth";
import { getSetting, setSetting } from "@/lib/server/store";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
async function requireAdmin(request: NextRequest) {
  const user = await requireUser(request);
  return user && isAllowlistedAdmin(user.email) ? user : null;
}
export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-chart-display-read", 30, 60);
  if (limited) return limited;
  if (!await requireAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const mode = (await getSetting<{ mode?: string }>("chartDisplay"))?.mode;
    return NextResponse.json({ mode: mode === "edge" || mode === "both" || mode === "tradingview" ? mode : "tradingview" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load chart display settings." }, { status: 500 });
  }
}
export async function PATCH(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-chart-display-write", 10, 60);
  if (limited) return limited;
  const actor = await requireAdmin(request);
  if (!actor) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    if (body.mode !== "tradingview" && body.mode !== "edge" && body.mode !== "both") return NextResponse.json({ error: "Choose TradingView, Edge Chart, or Both." }, { status: 400 });
    await setSetting("chartDisplay", { mode: body.mode }, actor.uid);
    return NextResponse.json({ ok: true, mode: body.mode }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Chart display settings update failed", error);
    return NextResponse.json({ error: "Could not save chart display settings. Check the PostgreSQL connection." }, { status: 500 });
  }
}
