import { NextRequest, NextResponse } from "next/server";

import {
  getCTraderConfig,
  getFreshCTraderSession,
  requireFirebaseUid,
} from "@/lib/ctrader/session";

import { probeFpMarketsLiveData } from "@/lib/ctrader/market-probe";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(
    request,
    "ctrader-market-test",
    5,
    60
  );

  if (limited) return limited;

  const uid = await requireFirebaseUid(request);

  if (!uid) {
    return NextResponse.json(
      { error: "Authentication required." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    const sessionResult = await getFreshCTraderSession(request);

    if (sessionResult.uid !== uid) {
      return NextResponse.json(
        { error: "Session verification failed." },
        { status: 403 }
      );
    }

    const session = sessionResult.session;

    if (!session) {
      return NextResponse.json(
        {
          connected: false,
          error: "cTrader session unavailable. Please reconnect.",
        },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const { clientId, clientSecret } = getCTraderConfig();

    const result = await probeFpMarketsLiveData({
      clientId,
      clientSecret,
      accessToken: session.accessToken,
      sampleMs: 7000,
    });

    return NextResponse.json(
      {
        ...result,
        tokenRefreshed: sessionResult.refreshed,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Pragma": "no-cache",
        },
      }
    );

  } catch (error) {
    console.error("cTrader market test failed:", error);

    return NextResponse.json(
      {
        connected: false,
        error: "Unable to test cTrader market data. Please try again.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}