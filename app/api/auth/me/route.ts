import { NextRequest, NextResponse } from "next/server";
import { AuthError, getBearerToken, verifyToken } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });
  try {
    return NextResponse.json({ user: await verifyToken(token) }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: 401, headers: NO_STORE });
    console.error("Session check failed:", error);
    return NextResponse.json({ error: "Could not verify the session." }, { status: 503, headers: NO_STORE });
  }
}
