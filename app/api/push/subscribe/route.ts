import { NextRequest, NextResponse } from "next/server";
import { requireFirebaseUid } from "@/lib/ctrader/session";
import { getAdminServices } from "@/lib/firebase-admin";
import { configurePush, endpointId } from "@/lib/push";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { const uid=await requireFirebaseUid(request); if(!uid) return NextResponse.json({error:"Authentication required"},{status:401}); try { configurePush(); const body=await request.json(); const token=body?.token; if(typeof token!=="string" || token.length<40 || token.length>8192) return NextResponse.json({error:"Invalid push subscription"},{status:400}); const {adminDb}=getAdminServices(); await adminDb.collection("users").doc(uid).collection("pushSubscriptions").doc(endpointId(token)).set({token,createdAt:Date.now(),updatedAt:Date.now(),userAgent:(request.headers.get("user-agent")||"").slice(0,300)}); return NextResponse.json({ok:true}); } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Could not save subscription"},{status:503}); } }
