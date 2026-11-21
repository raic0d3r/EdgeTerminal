import { NextResponse } from "next/server";
import { getSetting } from "@/lib/server/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const mode = (await getSetting<{ mode?: string }>("chartDisplay"))?.mode;
    return NextResponse.json({ mode: mode === "edge" || mode === "both" || mode === "tradingview" ? mode : "tradingview" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ mode: "tradingview" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
