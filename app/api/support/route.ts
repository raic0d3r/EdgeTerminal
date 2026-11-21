import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isAllowlistedAdmin, requireUser } from "@/lib/server/auth";
import { UUID_RE, addSupportMessage, getUserById, listAllSupportMessages, listSupportMessages } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function identify(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return null;
  return { uid: user.uid, email: user.email, admin: isAllowlistedAdmin(user.email) };
}

function serialize(row: { id:number; user_uid:string; sender_uid:string; sender_role:"user"|"admin"; body:string; created_at:string }) {
  return { id: row.id, userUid: row.user_uid, senderUid: row.sender_uid, senderRole: row.sender_role, body: row.body, createdAt: row.created_at };
}

export async function GET(request: NextRequest) {
  const actor = await identify(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const ticketUid = request.nextUrl.searchParams.get("ticketUid");
    if (actor.admin && request.nextUrl.searchParams.get("inbox") === "1") {
      return NextResponse.json({ messages: (await listAllSupportMessages()).map(serialize) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (ticketUid) {
      if (!actor.admin && ticketUid !== actor.uid) {
        return NextResponse.json({ error: "You can only view your own support conversation." }, { status: 403 });
      }
      return NextResponse.json({ messages: (await listSupportMessages(ticketUid)).map(serialize) }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ messages: (await listSupportMessages(actor.uid)).map(serialize) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Support messages read failed", error);
    return NextResponse.json({ error: "Support storage is unavailable. Check server configuration." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const actor = await identify(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limited = await enforceRateLimit({ key: `support:${actor.uid}`, limit: 10, windowSeconds: 60 });
  if (limited) return limited;
  try {
    const originFailure = enforceSameOrigin(request);
    if (originFailure) return originFailure;
    const parsed = await readJsonBody<{ body?: unknown; ticketUid?: unknown }>(request, 8 * 1024);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    const requestedUid = typeof payload.ticketUid === "string" ? payload.ticketUid.trim() : "";
    if (!body || body.length > 2000) return NextResponse.json({ error: "Enter a message between 1 and 2000 characters." }, { status: 400 });
    if (actor.admin) {
      if (!requestedUid) return NextResponse.json({ error: "Choose a support conversation to reply to." }, { status: 400 });
      if (!UUID_RE.test(requestedUid) || !(await getUserById(requestedUid))) return NextResponse.json({ error: "Support conversation not found." }, { status: 404 });
      const message = await addSupportMessage(requestedUid, actor.uid, "admin", body);
      return NextResponse.json({ message: serialize(message) }, { status: 201 });
    }
    // The target conversation is derived from the verified user's identity, never from client input.
    const message = await addSupportMessage(actor.uid, actor.uid, "user", body);
    return NextResponse.json({ message: serialize(message) }, { status: 201 });
  } catch (error) {
    console.error("Support message write failed", error);
    return NextResponse.json({ error: "Could not send your support message." }, { status: 500 });
  }
}
