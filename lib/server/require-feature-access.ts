import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, isAllowlistedAdmin, verifyToken } from "@/lib/server/auth";
import { getSetting } from "@/lib/server/store";
import { defaultFeatureRules, normalizeFeatureRules } from "@/lib/feature-access";

export type SubscriptionPlan = "member" | "vip" | "admin";

type AccessResult =
  | { allowed: true; uid: string; plan: SubscriptionPlan; isAdmin: boolean }
  | { allowed: false; response: NextResponse };

/** Enforces feature entitlements on the server. Never use frontend state as authorization. */
export async function requireFeatureAccess(
  request: NextRequest,
  featureTitle: string,
): Promise<AccessResult> {
  const token = getBearerToken(request);

  if (!token) {
    return { allowed: false, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  try {
    const decoded = await verifyToken(token);
    const isAdmin = isAllowlistedAdmin(decoded.email);

    const settings = await getSetting<{ rules?: unknown }>("featureAccess");
    const profile = { status: decoded.status, role: decoded.role, plan: undefined as string | undefined };
    const accountStatus = String(profile.status || "active").toLowerCase();
    if (!isAdmin && ["disabled", "suspended", "banned", "deleted"].includes(accountStatus)) {
      return { allowed: false, response: NextResponse.json({ error: "Account is not active." }, { status: 403 }) };
    }

    const rawPlan = String(profile.role || profile.plan || "member").toLowerCase();
    const plan: SubscriptionPlan = isAdmin ? "admin" : rawPlan === "vip" || rawPlan === "pro" ? "vip" : "member";

    const configuredRules = settings?.rules;
    const rules = normalizeFeatureRules(configuredRules ?? defaultFeatureRules());
    const rule = rules.find((item) => item.title === featureTitle);

    // Unknown features are denied by default: this prevents accidental public exposure.
    if (!rule) {
      return { allowed: false, response: NextResponse.json({ error: "Feature is not configured." }, { status: 403 }) };
    }
    if (!isAdmin && !rule.enabled) {
      return { allowed: false, response: NextResponse.json({ error: "Feature is currently disabled." }, { status: 403 }) };
    }

    const allowed = isAdmin || rule.tier === "FREE" || (rule.tier === "VIP" && plan === "vip");

    if (!allowed) {
      return { allowed: false, response: NextResponse.json({ error: "Subscription required.", requiredTier: rule.tier }, { status: 403 }) };
    }

    return { allowed: true, uid: decoded.uid, plan, isAdmin };
  } catch (error) {
    // Do not fail open when token verification or database access fails.
    console.error("Feature authorization failed:", error);
    return { allowed: false, response: NextResponse.json({ error: "Unable to verify feature permissions." }, { status: 503 }) };
  }
}
