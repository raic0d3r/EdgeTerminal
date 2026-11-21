import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, isAllowlistedAdmin, verifyToken } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const user = await verifyToken(token);
    const isAdmin = isAllowlistedAdmin(user.email);
    const isVip = isAdmin || user.role === "vip" || user.access.vipLounge || user.access.importantVip;
    return NextResponse.json({ isAdmin, isVip, vipLounge: isVip, importantVip: isVip }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Access check failed", error);
    return NextResponse.json({ error: "Could not verify access." }, { status: 500 });
  }
}
