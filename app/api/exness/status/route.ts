import { NextRequest, NextResponse } from "next/server";
import { getAdminServices, isAllowlistedAdmin } from "@/lib/firebase-admin";
import { decryptExnessCredentials } from "@/lib/exness/vault";
import { verifyExnessConnection } from "@/lib/exness/client";
import { getExnessTestCredentials, isExnessTestModeEnabled } from "@/lib/exness/test-mode";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "exness-status", 30, 60);
  if (limited) return limited;
  try {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ connected: false }, { status: 401 });
    const { adminAuth, adminDb } = getAdminServices();
    const user = await adminAuth.verifyIdToken(token, true);
    // Test credentials are only available to explicitly allowlisted admins.
    if (isExnessTestModeEnabled() && isAllowlistedAdmin(user.email)) {
      const credentials = getExnessTestCredentials();
      const verified = await verifyExnessConnection(credentials);
      return NextResponse.json({ connected: true, provider: "exness", testMode: true, accountId: credentials.accountId, account: { currency: String(verified.account.currency || ""), balance: String(verified.account.balance || ""), leverage: String(verified.account.leverage || "") } }, { headers: { "Cache-Control": "no-store" } });
    }
    const snap = await adminDb.collection("users").doc(user.uid).collection("brokerConnections").doc("exness").get();
    if (!snap.exists || !snap.data()?.encryptedCredentials) return NextResponse.json({ connected: false, provider: "exness", testMode: false }, { headers: { "Cache-Control": "no-store" } });
    const credentials = decryptExnessCredentials(String(snap.data()!.encryptedCredentials));
    const verified = await verifyExnessConnection(credentials);
    return NextResponse.json({ connected: true, provider: "exness", testMode: false, accountId: credentials.accountId, account: { currency: String(verified.account.currency || ""), balance: String(verified.account.balance || ""), leverage: String(verified.account.leverage || "") } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    const authFailure = code.startsWith("auth/");
    return NextResponse.json(
      { connected: false, provider: "exness", error: authFailure ? "Your session is invalid or revoked. Sign in again." : "Connection check failed." },
      { status: authFailure ? 401 : 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
