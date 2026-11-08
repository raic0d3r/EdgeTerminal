import { NextRequest, NextResponse } from "next/server";

import {
  deleteCTraderSession,
  requireFirebaseUid,
} from "@/lib/ctrader/session";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = await enforceIpRateLimit(
    request,
    "ctrader-disconnect",
    10,
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
    await deleteCTraderSession(uid);

    return NextResponse.json(
      { status: "disconnected" },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Pragma": "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("cTrader disconnect failed:", error);

    return NextResponse.json(
      { error: "Unable to disconnect cTrader. Please try again." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}