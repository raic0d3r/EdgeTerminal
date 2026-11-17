import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices, isAllowlistedAdmin } from "@/lib/firebase-admin";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
async function requireAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  try {
    const { adminAuth } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(token, true);
    return isAllowlistedAdmin(decoded.email) ? decoded : null;
  } catch { return null; }
}
export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-chart-display-read", 30, 60);
  if (limited) return limited;
  if (!await requireAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const { adminDb } = getAdminServices();
    const doc = await adminDb.collection("platformSettings").doc("chartDisplay").get();
    const mode = doc.data()?.mode;
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
    const { adminDb } = getAdminServices();
    await adminDb.collection("platformSettings").doc("chartDisplay").set({ mode: body.mode, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    return NextResponse.json({ ok: true, mode: body.mode }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Chart display settings update failed", error);
    return NextResponse.json({ error: "Could not save chart display settings. Check Firebase Admin configuration." }, { status: 500 });
  }
}
