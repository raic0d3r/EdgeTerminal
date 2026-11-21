import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth-postgres";
export const runtime = "nodejs";
export async function POST() { try { await destroySession(); return NextResponse.json({ok:true}); } catch { return NextResponse.json({error:"Logout failed."},{status:500}); } }
