import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { createSession, verifyPassword } from "@/lib/auth-postgres";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const b = await req.json(), email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "", password = typeof b.password === "string" ? b.password : "";
    if (!email || !password) return NextResponse.json({error:"Email and password are required."},{status:400});
    const r = await query("SELECT id,email,display_name,password_hash,role,is_active FROM app_users WHERE email=$1 LIMIT 1",[email]);
    const u = r.rows[0];
    if (!u || !u.password_hash || !(await verifyPassword(password,u.password_hash))) return NextResponse.json({error:"Invalid email or password."},{status:401});
    if (!u.is_active) return NextResponse.json({error:"Account disabled."},{status:403});
    await createSession(u.id);
    return NextResponse.json({ok:true,user:{id:u.id,email:u.email,displayName:u.display_name,role:u.role}});
  } catch(e) { console.error("Login failed",e); return NextResponse.json({error:"Login failed. Check PostgreSQL connection and migration."},{status:500}); }
}
