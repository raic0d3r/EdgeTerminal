import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db/postgres";
import { createSession, hashPassword, isAdminEmail } from "@/lib/auth-postgres";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const name = typeof b.displayName === "string" ? b.displayName.trim() : "";
    const password = typeof b.password === "string" ? b.password : "";
    if (!/^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(email)) return NextResponse.json({error:"Enter a valid email."},{status:400});
    if (!name || name.length > 60) return NextResponse.json({error:"Display name must be 1–60 characters."},{status:400});
    if (password.length < 10 || password.length > 128) return NextResponse.json({error:"Password must be at least 10 characters."},{status:400});
    const id = randomUUID(), hash = await hashPassword(password), role = isAdminEmail(email) ? "admin" : "user";
    await query("INSERT INTO app_users(id,email,display_name,password_hash,role,is_active) VALUES($1,$2,$3,$4,$5,TRUE)",[id,email,name,hash,role]);
    await createSession(id);
    return NextResponse.json({ok:true,user:{id,email,displayName:name,role}},{status:201});
  } catch(e) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505") return NextResponse.json({error:"An account with this email already exists."},{status:409});
    console.error("Register failed",e);
    return NextResponse.json({error:"Registration failed. Check PostgreSQL connection and migration."},{status:500});
  }
}
