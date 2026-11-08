import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices, isAllowlistedAdmin } from "@/lib/firebase-admin";

import { enforceIpRateLimit } from "@/lib/server/rate-limit";
export const runtime = "nodejs";

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return { actor: null, failure: jsonError("Missing Firebase sign-in token. Sign out and sign in again.", 401, "MISSING_TOKEN") };
  try {
    const { adminAuth } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(token, true);
    if (!isAllowlistedAdmin(decoded.email)) {
      return { actor: null, failure: jsonError("This signed-in email is not listed in the server-side ADMIN_EMAILS variable.", 403, "ADMIN_EMAIL_NOT_ALLOWLISTED") };
    }
    return { actor: decoded, failure: null };
  } catch (error) {
    console.error("Admin authentication failed for /api/admin/users:", error);
    return { actor: null, failure: jsonError("Admin authentication failed. Check FIREBASE_SERVICE_ACCOUNT_KEY and ADMIN_EMAILS in Vercel, then redeploy.", 503, "FIREBASE_ADMIN_AUTH_FAILED") };
  }
}

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-users-read", 30, 60);
  if (limited) return limited;
  const access = await requireAdmin(request);
  if (access.failure) return access.failure;
  try {
    const { adminAuth, adminDb } = getAdminServices();
    const [authResult, profiles] = await Promise.all([
      adminAuth.listUsers(1000),
      adminDb.collection("users").get()
    ]);
    const profileMap = new Map(profiles.docs.map(doc => [doc.id, doc.data()]));
    const users = authResult.users.map(user => {
      const profile = profileMap.get(user.uid) || {};
      return {
        uid: user.uid,
        email: user.email || "",
        displayName: profile.displayName || user.displayName || user.email?.split("@")[0] || "Member",
        role: profile.role || "member",
        status: profile.status || (user.disabled ? "disabled" : "active"),
        disabled: user.disabled,
        createdAt: user.metadata.creationTime || "",
        access: {
          generalSilver: profile.access?.generalSilver !== false,
          generalGold: profile.access?.generalGold === true,
          vipLounge: profile.access?.vipLounge === true,
          importantVip: profile.access?.importantVip === true
        }
      };
    });
    return NextResponse.json({ users, nextPageToken: authResult.pageToken || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin user list failed:", error);
    const detail = error instanceof Error ? error.message : "Unknown Firebase Admin error";
    return jsonError(`Could not load users from Firebase: ${detail}`, 500, "USER_LIST_FAILED");
  }
}

export async function PATCH(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-users-write", 15, 60);
  if (limited) return limited;
  const access = await requireAdmin(request);
  if (access.failure) return access.failure;
  const actor = access.actor!;
  try {
    const body = await request.json();
    const uid = String(body.uid || "");
    if (!uid || uid === actor.uid) return jsonError("A valid target user is required. You cannot change your own access here.", 400, "INVALID_TARGET_USER");
    const { adminAuth, adminDb } = getAdminServices();
    const userRef = adminDb.collection("users").doc(uid);
    const userRecord = await adminAuth.getUser(uid);
    const current = (await userRef.get()).data() || {};
    if (body.role !== undefined) {
      if (!["member", "pro", "vip", "admin"].includes(body.role)) return jsonError("Role must be member, pro, vip, or admin.", 400, "INVALID_ROLE");
      if (body.role === "admin") return jsonError("Admin promotion must be performed by a trusted operator.", 403, "ADMIN_PROMOTION_BLOCKED");
    }
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid };
    if (body.role !== undefined) update.role = body.role;
    if (body.status !== undefined) {
      if (!["active", "disabled"].includes(body.status)) return jsonError("Invalid account status.", 400, "INVALID_STATUS");
      await adminAuth.updateUser(uid, { disabled: body.status === "disabled" });
      update.status = body.status;
    }
    if (body.access !== undefined) {
      const accessPatch = body.access || {};
      const previous = current.access || {};
      update.access = {
        generalSilver: typeof accessPatch.generalSilver === "boolean" ? accessPatch.generalSilver : previous.generalSilver !== false,
        generalGold: typeof accessPatch.generalGold === "boolean" ? accessPatch.generalGold : previous.generalGold === true,
        vipLounge: typeof accessPatch.vipLounge === "boolean" ? accessPatch.vipLounge : previous.vipLounge === true,
        importantVip: typeof accessPatch.importantVip === "boolean" ? accessPatch.importantVip : previous.importantVip === true
      };
    }
    await userRef.set({
      ...update,
      email: userRecord.email || current.email || "",
      displayName: current.displayName || userRecord.displayName || userRecord.email?.split("@")[0] || "Member",
      role: body.role ?? current.role ?? "member",
      status: body.status ?? current.status ?? (userRecord.disabled ? "disabled" : "active")
    }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin user update failed:", error);
    const detail = error instanceof Error ? error.message : "Unknown Firebase Admin error";
    return jsonError(`Could not update this account: ${detail}`, 500, "USER_UPDATE_FAILED");
  }
}
