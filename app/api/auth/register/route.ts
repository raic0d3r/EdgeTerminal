import { NextRequest, NextResponse } from "next/server";
import { AuthError, PASSWORD_MAX, PASSWORD_MIN, createSession, normalizeEmail, registerUser } from "@/lib/server/auth";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";
import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const originFailure = enforceSameOrigin(request);
  if (originFailure) return originFailure;
  const limited = await enforceIpRateLimit(request, "auth-register", 10, 3600);
  if (limited) return limited;

  const parsed = await readJsonBody<{ email?: unknown; password?: unknown; displayName?: unknown }>(request, 4 * 1024);
  if (!parsed.ok) return parsed.response;

  const email = normalizeEmail(parsed.data.email);
  const password = typeof parsed.data.password === "string" ? parsed.data.password : "";
  const rawName = typeof parsed.data.displayName === "string" ? parsed.data.displayName.trim() : "";
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers: NO_STORE });
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return NextResponse.json({ error: `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.` }, { status: 400, headers: NO_STORE });
  }
  if (rawName.length > 60) return NextResponse.json({ error: "Display name must be 60 characters or fewer." }, { status: 400, headers: NO_STORE });
  const displayName = rawName || email.split("@")[0];

  try {
    // Registration can never grant privileged access: role/VIP flags always use the database defaults.
    const user = await registerUser({ email, password, displayName });
    const token = await createSession(user.uid, request.headers.get("user-agent"));
    return NextResponse.json({ token, user }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof AuthError && error.code === "auth/email-already-in-use") {
      return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE });
    }
    console.error("Registration failed:", error);
    return NextResponse.json({ error: "Could not create the account. Please try again." }, { status: 500, headers: NO_STORE });
  }
}
