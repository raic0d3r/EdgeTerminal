import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createOAuthTransaction, getCTraderConfig, requireFirebaseUid } from "@/lib/ctrader/session";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "ctrader-connect", 5, 600);
  if (limited) return limited;
  const uid = await requireFirebaseUid(request);
  if (!uid) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { clientId, redirectUri } = getCTraderConfig(); const state = randomBytes(32).toString("base64url");
    await createOAuthTransaction(uid, state);
    const authorizeUrl = new URL("https://id.ctrader.com/my/settings/openapi/grantingaccess/");
    authorizeUrl.searchParams.set("client_id", clientId); authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "accounts trading"); authorizeUrl.searchParams.set("product", "web"); authorizeUrl.searchParams.set("state", state);
    const response = NextResponse.json({ authorizeUrl: authorizeUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("edge_ctrader_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/ctrader", maxAge: 600 });
    return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start cTrader OAuth." }, { status: 500 }); }
}
