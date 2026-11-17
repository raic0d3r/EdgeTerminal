import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { adminDb } = getAdminServices();
    const doc = await adminDb.collection("platformSettings").doc("chartDisplay").get();
    const mode = doc.data()?.mode;
    return NextResponse.json({ mode: mode === "edge" || mode === "both" || mode === "tradingview" ? mode : "tradingview" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ mode: "tradingview" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
