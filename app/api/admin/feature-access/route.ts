import { NextRequest, NextResponse } from "next/server";
import { isAllowlistedAdmin, requireUser } from "@/lib/server/auth";
import { getSetting, setSetting } from "@/lib/server/store";

import {
  defaultFeatureRules,
  normalizeFeatureRules,
  validateFeatureRules,
} from "@/lib/feature-access";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const user = await requireUser(request);
  return user && isAllowlistedAdmin(user.email) ? user : null;
}

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-feature-access-read", 30, 60);
  if (limited) return limited;
  if (!await requireAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const saved = await getSetting<{ rules?: unknown }>("featureAccess");
    return NextResponse.json({ rules: normalizeFeatureRules(saved?.rules || defaultFeatureRules()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load feature access settings." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-feature-access-write", 15, 60);
  if (limited) return limited;
  const actor = await requireAdmin(request);
  if (!actor) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    if (!Array.isArray(body.rules)) return NextResponse.json({ error: "A rules array is required." }, { status: 400 });
    const rules = validateFeatureRules(body.rules);
    for (const rule of rules) {
      if (rule.subscriptionUrl && !/^https:\/\//i.test(rule.subscriptionUrl)) {
        return NextResponse.json({ error: `Subscription links must use HTTPS (${rule.title}).` }, { status: 400 });
      }
    }
    await setSetting("featureAccess", { rules }, actor.uid);
    return NextResponse.json({ ok: true, rules }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Feature access settings update failed", error);
    return NextResponse.json({ error: "Could not save feature access settings. Check the PostgreSQL connection." }, { status: 500 });
  }
}
