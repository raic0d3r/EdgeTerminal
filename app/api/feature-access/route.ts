import { NextRequest, NextResponse } from "next/server";
import { getAdminServices, isAllowlistedAdmin } from "@/lib/firebase-admin";
import { defaultFeatureRules, normalizeFeatureRules } from "@/lib/feature-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let rules = defaultFeatureRules();
  let plan: "member" | "pro" | "vip" | "admin" = "member";
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  try {
    const { adminAuth, adminDb } = getAdminServices();
    const configDoc = await adminDb.collection("platformSettings").doc("featureAccess").get();
    if (configDoc.exists) rules = normalizeFeatureRules(configDoc.data()?.rules);
    if (token) {
      const decoded = await adminAuth.verifyIdToken(token, true);
      if (isAllowlistedAdmin(decoded.email)) plan = "admin";
      else {
        const profile = (await adminDb.collection("users").doc(decoded.uid).get()).data() || {};
        const role = String(profile.role || profile.plan || "member").toLowerCase();
        if (role === "vip" || role === "pro") plan = role;
      }
    }
  } catch {
    // The default feature map keeps the app usable without Firebase Admin configured.
  }
  return NextResponse.json({ rules, plan }, { headers: { "Cache-Control": "no-store" } });
}
