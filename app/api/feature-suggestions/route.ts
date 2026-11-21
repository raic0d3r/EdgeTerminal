import { enforceSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/auth";
import { createFeatureSuggestion, listFeatureSuggestions } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Actor = { uid: string; displayName: string };

async function identify(request: NextRequest): Promise<Actor | null> {
  const user = await requireUser(request);
  if (!user) return null;
  const displayName = String(user.displayName?.trim() || user.email.split("@")[0] || "Member").slice(0, 60);
  return { uid: user.uid, displayName };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await identify(request);
    if (!actor) {
      return NextResponse.json({ error: "Sign in required. Please sign in again and retry." }, {
        status: 401, headers: { "Cache-Control": "no-store" },
      });
    }

    const suggestions = await listFeatureSuggestions(200);
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Feature suggestions read failed:", error);
    return NextResponse.json({ error: "Could not load suggestions. Check the PostgreSQL connection." }, {
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

    const suggestion = await createFeatureSuggestion(actor.uid, actor.displayName, title, description);

    return NextResponse.json({
      suggestion,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Feature suggestion create failed:", error);
    return NextResponse.json({ error: "Could not submit your suggestion. Check the PostgreSQL connection." }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
}
