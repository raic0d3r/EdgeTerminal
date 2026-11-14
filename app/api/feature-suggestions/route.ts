import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getAdminServices } from "@/lib/firebase-admin";
import type { DocumentData } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Actor = { uid: string; displayName: string };

async function identify(request: NextRequest): Promise<Actor | null> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
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
  } catch (error) {
    console.error("Feature suggestions authentication failed:", error);
    return null;
  }
}

function serialize(id: string, data: DocumentData) {
  const createdAt = data.createdAt?.toDate?.() ?? new Date(data.createdAt ?? Date.now());
  return {
    id,
    author: String(data.author ?? "Member"),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    createdAt: createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await identify(request);
    if (!actor) {
      return NextResponse.json({ error: "Sign in required. Please sign in again and retry." }, {
        status: 401, headers: { "Cache-Control": "no-store" },
      });
    }

    const { adminDb } = getAdminServices();
    const snapshot = await adminDb.collection("featureSuggestions")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const suggestions = snapshot.docs.map((doc) => serialize(doc.id, doc.data()));
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Feature suggestions read failed:", error);
    return NextResponse.json({ error: "Could not load suggestions. Check Firebase Admin credentials and Firestore access." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await identify(request);
    if (!actor) {
      return NextResponse.json({ error: "Sign in required. Please sign in again and retry." }, {
        status: 401, headers: { "Cache-Control": "no-store" },
      });
    }

    const originFailure = enforceSameOrigin(request);
    if (originFailure) return originFailure;

    const limited = await enforceRateLimit({ key: `suggestions:${actor.uid}`, limit: 5, windowSeconds: 60 });
    if (limited) return limited;

    const parsed = await readJsonBody<{ title?: unknown; description?: unknown }>(request, 8 * 1024);
    if (!parsed.ok) return parsed.response;

    const title = typeof parsed.data.title === "string" ? parsed.data.title.trim() : "";
    const description = typeof parsed.data.description === "string" ? parsed.data.description.trim() : "";
    if (!title || title.length > 100) {
      return NextResponse.json({ error: "Enter a feature title between 1 and 100 characters." }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json({ error: "Description must be 2000 characters or fewer." }, { status: 400 });
    }

    const { adminDb } = getAdminServices();
    const createdAt = new Date();
    const doc = await adminDb.collection("featureSuggestions").add({
      uid: actor.uid,
      author: actor.displayName,
      title,
      description,
      createdAt,
    });

    return NextResponse.json({
      suggestion: serialize(doc.id, { uid: actor.uid, author: actor.displayName, title, description, createdAt }),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Feature suggestion create failed:", error);
    return NextResponse.json({ error: "Could not submit your suggestion. Check Firebase Admin credentials and Firestore access." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}
