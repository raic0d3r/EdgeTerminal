import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase-admin";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export async function DELETE(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "exness-disconnect", 10, 60);
  if (limited) return limited;
  try {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const { adminAuth, adminDb } = getAdminServices(); const user = await adminAuth.verifyIdToken(token, true);
    await adminDb.collection("users").doc(user.uid).collection("brokerConnections").doc("exness").delete();
    return NextResponse.json({ disconnected: true });
  } catch { return NextResponse.json({ error: "Could not disconnect Exness." }, { status: 500 }); }
}
