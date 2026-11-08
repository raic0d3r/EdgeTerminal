import { NextRequest, NextResponse } from "next/server";
import { getAdminServices, isAllowlistedAdmin } from "@/lib/firebase-admin";
import { defaultFeatureRules, normalizeFeatureRules } from "@/lib/feature-access";

export type SubscriptionPlan = "member" | "pro" | "vip" | "admin";

type AccessResult =
  | { allowed: true; uid: string; plan: SubscriptionPlan; isAdmin: boolean }
  | { allowed: false; response: NextResponse };

/** Enforces feature entitlements on the server. Never use frontend state as authorization. */
export async function requireFeatureAccess(
  request: NextRequest,
  featureTitle: string,
): Promise<AccessResult> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return { allowed: false, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  try {
    const { adminAuth, adminDb } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(token, true);
    const isAdmin = isAllowlistedAdmin(decoded.email);

    const [profileSnapshot, settingsSnapshot] = await Promise.all([
      adminDb.collection("users").doc(decoded.uid).get(),
      adminDb.collection("platformSettings").doc("featureAccess").get(),
    ]);

    const profile = profileSnapshot.data() || {};
    const accountStatus = String(profile.status || "active").toLowerCase();
    if (!isAdmin && ["disabled", "suspended", "banned", "deleted"].includes(accountStatus)) {
      return { allowed: false, response: NextResponse.json({ error: "Account is not active." }, { status: 403 }) };
    }

    const rawPlan = String(profile.role || profile.plan || "member").toLowerCase();
    const plan: SubscriptionPlan = isAdmin ? "admin" : rawPlan === "vip" ? "vip" : rawPlan === "pro" ? "pro" : "member";

    const configuredRules = settingsSnapshot.exists ? settingsSnapshot.data()?.rules : undefined;
    const rules = normalizeFeatureRules(configuredRules ?? defaultFeatureRules());
    const rule = rules.find((item) => item.title === featureTitle);

    // Unknown features are denied by default: this prevents accidental public exposure.
    if (!rule) {
      return { allowed: false, response: NextResponse.json({ error: "Feature is not configured." }, { status: 403 }) };
    }
    if (!isAdmin && !rule.enabled) {
      return { allowed: false, response: NextResponse.json({ error: "Feature is currently disabled." }, { status: 403 }) };
    }

    const allowed = isAdmin || rule.tier === "FREE" ||
      (rule.tier === "PRO" && (plan === "pro" || plan === "vip")) ||
      (rule.tier === "VIP" && plan === "vip");

    if (!allowed) {
      return { allowed: false, response: NextResponse.json({ error: "Subscription required.", requiredTier: rule.tier }, { status: 403 }) };
    }

    return { allowed: true, uid: decoded.uid, plan, isAdmin };
  } catch (error) {
    // Do not fail open when token verification or Firebase Admin access fails.
    console.error("Feature authorization failed:", error);
    return { allowed: false, response: NextResponse.json({ error: "Unable to verify feature permissions." }, { status: 503 }) };
  }
}
