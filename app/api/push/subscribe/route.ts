import { NextRequest, NextResponse } from "next/server";
import { requireUid } from "@/lib/server/auth";
import { savePushSubscription } from "@/lib/server/store";
import { configurePush } from "@/lib/push";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const uid = await requireUid(request);
  if (!uid) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    configurePush();
    const body = await request.json();
    const sub = body?.subscription;
    const endpoint = sub?.endpoint;
    if (typeof endpoint !== "string" || !/^https:\/\//i.test(endpoint) || endpoint.length > 2048
      || typeof sub?.keys?.p256dh !== "string" || typeof sub?.keys?.auth !== "string") {
      return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
    }
    await savePushSubscription(uid, { endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, endpoint, request.headers.get("user-agent") || "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save subscription" }, { status: 503 });
  }
}
