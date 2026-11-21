import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { getUserById, updateOwnProfile } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function PATCH(request: NextRequest) {
  const originFailure = enforceSameOrigin(request);
  if (originFailure) return originFailure;
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });
  const limited = await enforceRateLimit({ key: `profile:${user.uid}`, limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ displayName?: unknown; photoURL?: unknown }>(request, 4 * 1024);
  if (!parsed.ok) return parsed.response;
  const patch: { displayName?: string; photoURL?: string | null } = {};

  if (parsed.data.displayName !== undefined) {
    const name = typeof parsed.data.displayName === "string" ? parsed.data.displayName.trim() : "";
    if (!name || name.length > 60) return NextResponse.json({ error: "Name must be 1-60 characters." }, { status: 400, headers: NO_STORE });
    patch.displayName = name;
  }
  if (parsed.data.photoURL !== undefined) {
    if (parsed.data.photoURL === null || parsed.data.photoURL === "") patch.photoURL = null;
    else if (typeof parsed.data.photoURL === "string" && parsed.data.photoURL.length <= 500 && /^https?:\/\//i.test(parsed.data.photoURL)) patch.photoURL = parsed.data.photoURL;
    else return NextResponse.json({ error: "Avatar must be an http(s) URL up to 500 characters." }, { status: 400, headers: NO_STORE });
  }
  try {
    await updateOwnProfile(user.uid, patch);
    return NextResponse.json({ user: await getUserById(user.uid) }, { headers: NO_STORE });
  } catch (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json({ error: "Could not update your profile." }, { status: 500, headers: NO_STORE });
  }
}
