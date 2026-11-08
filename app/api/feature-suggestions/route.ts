import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getAdminServices } from "@/lib/firebase-admin";
import { createFeatureSuggestion, listFeatureSuggestions } from "@/lib/feature-suggestions-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Actor = { uid: string; displayName: string };
async function identify(request: NextRequest): Promise<Actor | null> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  try {
    const { adminAuth, adminDb } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(token, true);
    const [user, profile] = await Promise.all([
      adminAuth.getUser(decoded.uid),
      adminDb.collection("users").doc(decoded.uid).get(),
    ]);
    const profileName = profile.data()?.displayName;
    const displayName = String(
      (typeof profileName === "string" && profileName.trim()) ||
      (user.displayName && user.displayName.trim()) ||
      user.email?.split("@")[0] || "Member"
    ).trim().slice(0, 60);
    return { uid: decoded.uid, displayName };
  } catch {
    return null;
  }
}

function serialize(row: ReturnType<typeof listFeatureSuggestions>[number]) {
  return { id: row.id, author: row.author, title: row.title, description: row.description, createdAt: row.created_at };
}

export async function GET(request: NextRequest) {
  const actor = await identify(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    return NextResponse.json({ suggestions: listFeatureSuggestions().map(serialize) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Feature suggestions read failed", error);
    return NextResponse.json({ error: "Could not load suggestions." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await identify(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limited = await enforceRateLimit({ key: `suggestions:${actor.uid}`, limit: 5, windowSeconds: 60 });
  if (limited) return limited;
  try {
    const originFailure = enforceSameOrigin(request);
    if (originFailure) return originFailure;
    const parsed = await readJsonBody<{ title?: unknown; description?: unknown }>(request, 8 * 1024);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    if (!title || title.length > 100) return NextResponse.json({ error: "Enter a feature title between 1 and 100 characters." }, { status: 400 });
    if (description.length > 2000) return NextResponse.json({ error: "Description must be 2000 characters or fewer." }, { status: 400 });
    const suggestion = createFeatureSuggestion(actor.uid, actor.displayName, title, description);
    return NextResponse.json({ suggestion: serialize(suggestion) }, { status: 201 });
  } catch (error) {
    console.error("Feature suggestion create failed", error);
    return NextResponse.json({ error: "Could not submit your suggestion." }, { status: 500 });
  }
}
