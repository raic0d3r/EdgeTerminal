import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, authenticate, createSession, normalizeEmail } from "@/lib/server/auth";
import { enforceIpRateLimit, enforceRateLimit } from "@/lib/server/rate-limit";
import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const originFailure = enforceSameOrigin(request);
  if (originFailure) return originFailure;
  const limited = await enforceIpRateLimit(request, "auth-login", 30, 600);
  if (limited) return limited;

  const parsed = await readJsonBody<{ email?: unknown; password?: unknown }>(request, 2 * 1024);
  if (!parsed.ok) return parsed.response;
  const email = normalizeEmail(parsed.data.email);
  const password = typeof parsed.data.password === "string" ? parsed.data.password : "";
  if (!email || !password || password.length > 128) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401, headers: NO_STORE });
  }

  // Per-account throttle (hashed so raw e-mails never land in the rate-limit table).
  const accountLimited = await enforceRateLimit({
    key: `login:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`, limit: 8, windowSeconds: 600,
  });
  if (accountLimited) return accountLimited;

  try {
    const user = await authenticate(email, password);
    const token = await createSession(user.uid, request.headers.get("user-agent"));
    return NextResponse.json({ token, user }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "auth/user-disabled" ? 403 : 401;
      return NextResponse.json({ error: error.message }, { status, headers: NO_STORE });
    }
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Could not sign in. Please try again." }, { status: 500, headers: NO_STORE });
  }
}
