import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, revokeSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  try { if (token) await revokeSession(token); } catch (error) { console.error("Logout failed:", error); }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
