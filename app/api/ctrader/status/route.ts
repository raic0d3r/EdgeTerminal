import { NextRequest, NextResponse } from "next/server";

import {
  getFreshCTraderSession,
  requireFirebaseUid,
} from "@/lib/ctrader/session";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(
    request,
    "ctrader-status",
    30,
    60
  );

  if (limited) return limited;

  const uid = await requireFirebaseUid(request);

  if (!uid) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const result = await getFreshCTraderSession(request);

    // Defense in depth: verify the returned session identity.
    if (result.uid !== uid) {
      return NextResponse.json(
        { error: "Session verification failed." },
        { status: 403 }
      );
    }

    const configured = Boolean(
      process.env.CTRADER_CLIENT_ID &&
      process.env.CTRADER_CLIENT_SECRET &&
      process.env.CTRADER_REDIRECT_URI
    );

    return NextResponse.json(
      {
        configured,
        connected: Boolean(
          result.session &&
          result.session.expiresAt > Date.now()
        ),
        expiresAt: result.session?.expiresAt ?? null,
        permissions: result.session ? ["accounts"] : [],
        tokenRefreshed: result.refreshed,
        nextStep: result.session
          ? "cTrader session is ready."
          : "Reconnect cTrader to restore access.",
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Pragma": "no-cache",
        },
      }
    );

  } catch (error) {
    console.error("cTrader status verification failed:", error);

    return NextResponse.json(
      { error: "Unable to verify cTrader connection." },
      { status: 503 }
    );
  }
}