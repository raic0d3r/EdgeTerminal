import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase-admin";
import { verifyExnessConnection, type ExnessCredentials } from "@/lib/exness/client";
import { encryptExnessCredentials } from "@/lib/exness/vault";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function currentUser(request: NextRequest) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in to connect a broker.");
  const { adminAuth } = getAdminServices(); return adminAuth.verifyIdToken(token, true);
}
export async function POST(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "exness-connect", 5, 600);
  if (limited) return limited;
  try {
    const user = await currentUser(request);
    const originFailure = enforceSameOrigin(request);
    if (originFailure) return originFailure;
    const parsed = await readJsonBody<{ apiKey?: unknown; privateKey?: unknown; accountId?: unknown; gatewayUrl?: unknown }>(request, 12 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const privateKey = typeof body.privateKey === "string" ? body.privateKey.trim() : "";
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    const gatewayUrl = typeof body.gatewayUrl === "string" ? body.gatewayUrl.trim() : "";
    if (!apiKey || apiKey.length > 512) return NextResponse.json({ connected: false, error: "Invalid API key." }, { status: 400 });
    if (privateKey.length < 64 || privateKey.length > 4096) return NextResponse.json({ connected: false, error: "Private signing key must be between 64 and 4096 characters." }, { status: 400 });
    if (!accountId || accountId.length > 128) return NextResponse.json({ connected: false, error: "Invalid account ID." }, { status: 400 });
    if (gatewayUrl && (gatewayUrl.length > 512 || !/^https:\/\//i.test(gatewayUrl))) return NextResponse.json({ connected: false, error: "Invalid gateway URL." }, { status: 400 });
    const credentials: ExnessCredentials = { apiKey, privateKey, accountId, gatewayUrl };
    const verified = await verifyExnessConnection(credentials);
    credentials.accessPoint = verified.accessPoint;
    const { adminDb } = getAdminServices();
    await adminDb.collection("users").doc(user.uid).collection("brokerConnections").doc("exness").set({
      encryptedCredentials: encryptExnessCredentials(credentials),
      accountId: credentials.accountId,
      accessPoint: verified.accessPoint,
      connected: true,
      accountSummary: {
        currency: String(verified.account.currency || ""),
        balance: String(verified.account.balance || ""),
        leverage: String(verified.account.leverage || ""),
      },
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ connected: true, provider: "exness", accountId: credentials.accountId, account: { currency: String(verified.account.currency || ""), balance: String(verified.account.balance || ""), leverage: String(verified.account.leverage || "") }, message: "Exness account verified and securely connected." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    const status = /sign in/i.test(message) || code.startsWith("auth/") ? 401 : /FIREBASE_SERVICE|encryption key/i.test(message) ? 503 : 502;
    console.error("Exness connection failed", { status, code: code.slice(0, 40) });
    return NextResponse.json({ connected: false, provider: "exness", error: status === 401 ? "Authentication required." : status === 503 ? "Broker connection is temporarily unavailable." : "Could not verify the Exness connection. Check the credentials and try again." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
