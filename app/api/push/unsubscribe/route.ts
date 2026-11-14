import { NextRequest, NextResponse } from "next/server";
import { requireFirebaseUid } from "@/lib/ctrader/session";
import { getAdminServices } from "@/lib/firebase-admin";
import { endpointId } from "@/lib/push";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { const uid=await requireFirebaseUid(request); if(!uid) return NextResponse.json({error:"Authentication required"},{status:401}); try { const body=await request.json(); if(typeof body?.token!=="string") return NextResponse.json({error:"Endpoint required"},{status:400}); const {adminDb}=getAdminServices(); await adminDb.collection("users").doc(uid).collection("pushSubscriptions").doc(endpointId(body.token)).delete(); return NextResponse.json({ok:true}); } catch { return NextResponse.json({error:"Could not remove subscription"},{status:500}); } }
