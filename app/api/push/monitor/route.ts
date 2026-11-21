import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { pushStats } from "@/lib/server/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Health/guard endpoint for an external scheduler (cron). Market evaluation is intentionally not
// enabled until a persistent server-side broker data credential path is configured.
export async function GET(request: NextRequest) {
  const secret = process.env.PUSH_CRON_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || supplied.length !== secret.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { subscriptions, armedAlerts } = await pushStats();
    return NextResponse.json({ ok: true, subscriptions, armedAlerts, marketMonitor: "not_configured",
      message: "Push delivery is ready, but autonomous market checks are not enabled. The current broker quote route requires a signed-in user session; configure a server-side broker session monitor before relying on background price alerts." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Monitor status unavailable" }, { status: 503 });
  }
}
