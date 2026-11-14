import { NextRequest, NextResponse } from "next/server";
import { requireFirebaseUid } from "@/lib/ctrader/session";
import { configurePush, sendPushToUser } from "@/lib/push";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { const uid=await requireFirebaseUid(request); if(!uid) return NextResponse.json({error:"Authentication required"},{status:401}); try { configurePush(); const result=await sendPushToUser(uid,{title:"EdgeTerminal test notification",body:"Push delivery is connected to this device.",url:"/",tag:"edge-push-test"}); return NextResponse.json({ok:result.sent>0,...result}, {status:result.sent?200:404}); } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Push delivery failed"},{status:503}); } }
