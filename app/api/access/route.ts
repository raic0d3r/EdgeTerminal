import { NextRequest, NextResponse } from "next/server";
import { getAdminServices, isAllowlistedAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const { adminAuth, adminDb } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(token, true);
    const profileSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const profile = profileSnap.data() || {};
    const access = (profile.access || {}) as Record<string, unknown>;
    const role = String(profile.role || profile.plan || "").trim().toLowerCase();
    const isAdmin = isAllowlistedAdmin(decoded.email);
    const accountEnabled = String(profile.status || "active").toLowerCase() !== "disabled";
    const isVip = isAdmin || (accountEnabled && (role === "vip" || access.vipLounge === true || access.importantVip === true));
    return NextResponse.json({ isAdmin, isVip, vipLounge: isVip, importantVip: isVip }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Access check failed", error);
    return NextResponse.json({ error: "Could not verify access." }, { status: 500 });
  }
}
