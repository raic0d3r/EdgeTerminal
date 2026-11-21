import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-postgres";
export const runtime = "nodejs";
export async function GET() { try { return NextResponse.json({user: await getSessionUser()}); } catch { return NextResponse.json({error:"Session check failed."},{status:500}); } }
