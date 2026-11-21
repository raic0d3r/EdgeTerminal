import { NextRequest, NextResponse } from "next/server";
import { requireUid } from "@/lib/server/auth";
import { deletePushSubscription } from "@/lib/server/store";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const uid = await requireUid(request);
  if (!uid) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
    await deletePushSubscription(uid, body.endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not remove subscription" }, { status: 500 });
  }
}
