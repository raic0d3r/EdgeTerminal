import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAdminServices } from "@/lib/firebase-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Health/guard endpoint for an external scheduler. Market evaluation is intentionally not
// enabled until a persistent server-side broker data credential path is configured.
export async function GET(request: NextRequest) { const secret=process.env.PUSH_CRON_SECRET||""; const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||""; if(!secret || supplied.length!==secret.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(secret))) return NextResponse.json({error:"Unauthorized"},{status:401}); try { const {adminDb}=getAdminServices(); const users=await adminDb.collection("users").get(); let subscriptions=0, armedAlerts=0; for(const user of users.docs){ const [subs,alerts]=await Promise.all([user.ref.collection("pushSubscriptions").count().get(),user.ref.collection("priceAlerts").count().get()]); subscriptions+=subs.data().count; armedAlerts+=alerts.data().count; } return NextResponse.json({ok:true,subscriptions,armedAlerts,marketMonitor:"not_configured",message:"Push delivery is ready, but autonomous market checks are not enabled. The current broker quote route requires a user Firebase ID token; configure a server-side broker session monitor before relying on background price alerts."}); } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Monitor status unavailable"},{status:503}); } }
