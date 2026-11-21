import { NextRequest, NextResponse } from "next/server";
import { requireUid } from "@/lib/ctrader/session";
import { configurePush } from "@/lib/push";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { if (!await requireUid(request)) return NextResponse.json({error:"Authentication required"},{status:401}); try { return NextResponse.json({publicKey:configurePush().publicKey}); } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Push unavailable"},{status:503}); } }
