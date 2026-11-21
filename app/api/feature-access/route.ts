import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, isAllowlistedAdmin, verifyToken } from "@/lib/server/auth";
import { getSetting } from "@/lib/server/store";
import { defaultFeatureRules, normalizeFeatureRules } from "@/lib/feature-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let rules = defaultFeatureRules();
  let plan: "member" | "vip" | "admin" = "member";
  const token = getBearerToken(request);
  try {
    const config = await getSetting<{ rules?: unknown }>("featureAccess");
    if (config?.rules) rules = normalizeFeatureRules(config.rules);
    if (token) {
      const user = await verifyToken(token);
      if (isAllowlistedAdmin(user.email)) plan = "admin";
      else if (user.role === "vip") plan = "vip";
    }
  } catch {
    // The default feature map keeps the app usable if the database is briefly unavailable.
  }
  return NextResponse.json({ rules, plan }, { headers: { "Cache-Control": "no-store" } });
}
