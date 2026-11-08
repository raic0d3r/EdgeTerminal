import { NextRequest, NextResponse } from "next/server";
import { getCTraderConfig, getFreshCTraderSession } from "@/lib/ctrader/session";
import { fetchLiveCTraderAccounts } from "@/lib/ctrader/openapi-json";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "ctrader-accounts", 30, 60);
  if (limited) return limited;
  const sessionResult = await getFreshCTraderSession(request);
  const session = sessionResult.session;
  if (!session) {
    const response = NextResponse.json({ connected: false, error: "Your cTrader session is missing, expired, or could not be refreshed. Reconnect first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return response;
  }

  try {
    const { clientId, clientSecret } = getCTraderConfig();
    const accounts = await fetchLiveCTraderAccounts({ clientId, clientSecret, accessToken: session.accessToken });
    const response = NextResponse.json({
      connected: true, environment: "live", accountCount: accounts.length, accounts,
      note: "Account list retrieved using the accounts-only permission. No trading operation was performed.",
      tokenRefreshed: sessionResult.refreshed,
    }, { headers: { "Cache-Control": "no-store" } });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retrieve cTrader accounts.";
    const response = NextResponse.json({ connected: true, environment: "live", error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
    return response;
  }
}
