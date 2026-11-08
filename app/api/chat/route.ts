import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { addMessage, listMessages, validGroups } from "@/lib/chat-db";
import { getAdminServices, isAllowlistedAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Actor = { uid: string; displayName: string; isAdmin: boolean; isVip: boolean };

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
    const profileData = profile.data() || {};
    const profileName = profileData.displayName;
    const isAdmin = isAllowlistedAdmin(decoded.email);
    const access = (profileData.access || {}) as Record<string, unknown>;
    const isVip = isAdmin || profileData.role === "vip" || access.vipLounge === true || access.importantVip === true;
    const displayName = String(
      (typeof profileName === "string" && profileName.trim()) ||
      (user.displayName && user.displayName.trim()) ||
      user.email?.split("@")[0] ||
      "Member"
    ).trim().slice(0, 60);
    return { uid: decoded.uid, displayName, isAdmin, isVip };
  } catch {
    return null;
  }
}

function serialize(message: { id:number; group_key:string; author:string; body:string; created_at:string }) {
  return { id: message.id, groupKey: message.group_key, author: message.author, body: message.body, createdAt: message.created_at };
}

export async function GET(request: NextRequest) {
  const actor = await identify(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const groupKey = request.nextUrl.searchParams.get("group") || "";
  if (!validGroups.has(groupKey)) return NextResponse.json({ error: "Unknown group." }, { status: 400 });
  if ((groupKey === "vip-lounge" || groupKey === "important-vip") && !actor.isVip) {
    return NextResponse.json({ error: "VIP membership is required to access this conversation." }, { status: 403 });
  }
  try {
    return NextResponse.json({ messages: listMessages(groupKey).map(serialize) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Chat read failed", error);
    return NextResponse.json({ error: "Chat storage is unavailable." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await identify(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limited = await enforceRateLimit({ key: `chat:${actor.uid}`, limit: 20, windowSeconds: 60 });
  if (limited) return limited;
  try {
    const originFailure = enforceSameOrigin(request);
    if (originFailure) return originFailure;
    const parsed = await readJsonBody<{ groupKey?: unknown; body?: unknown }>(request, 8 * 1024);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const groupKey = typeof payload.groupKey === "string" ? payload.groupKey : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!validGroups.has(groupKey)) return NextResponse.json({ error: "Unknown group." }, { status: 400 });
    if ((groupKey === "vip-lounge" || groupKey === "important-vip") && !actor.isVip) {
      return NextResponse.json({ error: "VIP membership is required to access this conversation." }, { status: 403 });
    }
    if (!body || body.length > 2000) return NextResponse.json({ error: "Enter a message between 1 and 2000 characters." }, { status: 400 });
    // The author comes from the verified Firebase account, never from client-submitted text.
    const message = addMessage(groupKey, actor.displayName, body);
    return NextResponse.json({ message: serialize(message) }, { status: 201 });
  } catch (error) {
    console.error("Chat write failed", error);
    return NextResponse.json({ error: "Could not save the message." }, { status: 500 });
  }
}
